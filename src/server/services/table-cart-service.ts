import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { domainError } from '../../domain/errors';
import { generateQrToken } from '../../domain/session/qr-token';
import { isTableNumber } from '../../domain/table';
import type { Locale } from '../../i18n/locales';
import type { AppDatabase as Db } from '../db/client';
import { menuItems, restaurantTables, tableCartLines, tableCarts } from '../db/schema';

/**
 * One shared cart per table.
 *
 * Every phone that scans a table's card reads and changes the same list, and
 * the staff see it on their phones: they go to the table, take the order from
 * it, add what a guest orders from the printed card, and clear the table once
 * the guests have paid. Clearing closes the cart (who and when are kept) and
 * the table's next guests start a new one.
 *
 * Changes are made line by line — add one, take one away, set a quantity — and
 * each is a single statement, so two guests tapping at the same moment both
 * count rather than one overwriting the other.
 */

/** Who changed a line: a guest's phone, or the member of staff by name. */
export type CartActor = 'guest' | { staff: string };

export interface TableCartLine {
  readonly menuItemId: string;
  readonly dishNumber: string | null;
  readonly name: string;
  readonly nameVi: string;
  readonly volume: string | null;
  readonly unitPriceCents: number;
  readonly quantity: number;
  readonly isAvailable: boolean;
  /** 'guest', or the name of the member of staff who last changed the line. */
  readonly changedBy: string;
}

export interface TableCart {
  readonly tableNumber: string;
  readonly lines: TableCartLine[];
  readonly count: number;
  readonly totalCents: number;
  /** When the cart last changed; null for a table with no open cart. */
  readonly updatedAt: string | null;
}

export const MAX_QUANTITY = 99;

function actorName(actor: CartActor): string {
  return actor === 'guest' ? 'guest' : actor.staff;
}

function localised(row: { nameEn: string; nameDe: string; nameVi: string }, locale: Locale): string {
  return locale === 'de' ? row.nameDe : locale === 'vi' ? row.nameVi : row.nameEn;
}

async function activeTable(db: Db, tableNumber: string) {
  if (!isTableNumber(tableNumber)) throw domainError('TABLE_NOT_FOUND', 'No such table');
  const [table] = await db
    .select()
    .from(restaurantTables)
    .where(and(eq(restaurantTables.tableNumber, tableNumber), eq(restaurantTables.isActive, true)));
  if (!table) throw domainError('TABLE_NOT_FOUND', 'No such table', { tableNumber });
  return table;
}

async function openCartId(db: Db, tableId: string): Promise<string | null> {
  const [cart] = await db
    .select({ id: tableCarts.id })
    .from(tableCarts)
    .where(and(eq(tableCarts.tableId, tableId), isNull(tableCarts.clearedAt)));
  return cart?.id ?? null;
}

export async function getTableCart(db: Db, tableNumber: string, locale: Locale): Promise<TableCart> {
  const table = await activeTable(db, tableNumber);
  const [cart] = await db
    .select()
    .from(tableCarts)
    .where(and(eq(tableCarts.tableId, table.id), isNull(tableCarts.clearedAt)));
  if (!cart) return { tableNumber, lines: [], count: 0, totalCents: 0, updatedAt: null };

  const rows = await db
    .select({ line: tableCartLines, item: menuItems })
    .from(tableCartLines)
    .innerJoin(menuItems, eq(menuItems.id, tableCartLines.menuItemId))
    .where(eq(tableCartLines.cartId, cart.id))
    .orderBy(asc(tableCartLines.addedAt), asc(menuItems.sortOrder));

  const lines = rows
    .filter(({ line }) => line.quantity > 0)
    .map(({ line, item }) => ({
      menuItemId: item.id,
      dishNumber: item.dishNumber,
      name: localised(item, locale),
      nameVi: item.nameVi,
      volume: item.volume,
      unitPriceCents: item.priceCents,
      quantity: line.quantity,
      isAvailable: item.isAvailable,
      changedBy: line.changedBy,
    }));

  return {
    tableNumber,
    lines,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    totalCents: lines.reduce((n, l) => n + l.quantity * l.unitPriceCents, 0),
    updatedAt: cart.updatedAt.toISOString(),
  };
}

export type CartChange =
  | { readonly menuItemId: string; readonly delta: number }
  | { readonly menuItemId: string; readonly quantity: number };

/**
 * Adds to, takes from, or sets one line of a table's cart, opening the cart if
 * the table has none. A guest cannot add a dish that is sold out; the staff can,
 * since they are the ones who know.
 */
export async function changeCartLine(db: Db, tableNumber: string, change: CartChange, actor: CartActor) {
  const table = await activeTable(db, tableNumber);
  const by = actorName(actor);

  const [item] = await db
    .select({ id: menuItems.id, isActive: menuItems.isActive, isAvailable: menuItems.isAvailable })
    .from(menuItems)
    .where(eq(menuItems.id, change.menuItemId));
  if (!item || !item.isActive) throw domainError('ITEMS_UNAVAILABLE', 'No such dish on the menu');

  const adding = 'delta' in change ? change.delta > 0 : change.quantity > 0;
  if (adding && actor === 'guest' && !item.isAvailable) {
    throw domainError('ITEMS_UNAVAILABLE', 'That dish is sold out', { menuItemId: item.id });
  }

  await db.transaction(async (tx: Db) => {
    // The partial unique index allows one open cart per table: a second phone
    // opening it at the same moment finds the first one's.
    await tx.insert(tableCarts).values({ tableId: table.id }).onConflictDoNothing();
    const cartId = (await openCartId(tx, table.id))!;
    const line = and(eq(tableCartLines.cartId, cartId), eq(tableCartLines.menuItemId, item.id));

    if ('delta' in change) {
      const delta = Math.trunc(change.delta);
      await tx
        .insert(tableCartLines)
        .values({ cartId, menuItemId: item.id, quantity: clamp(delta), changedBy: by })
        .onConflictDoUpdate({
          target: [tableCartLines.cartId, tableCartLines.menuItemId],
          set: {
            quantity: sql`least(${MAX_QUANTITY}, greatest(0, ${tableCartLines.quantity} + ${delta}))`,
            changedBy: by,
          },
        });
    } else if (change.quantity <= 0) {
      await tx.delete(tableCartLines).where(line);
    } else {
      const quantity = clamp(change.quantity);
      await tx
        .insert(tableCartLines)
        .values({ cartId, menuItemId: item.id, quantity, changedBy: by })
        .onConflictDoUpdate({
          target: [tableCartLines.cartId, tableCartLines.menuItemId],
          set: { quantity, changedBy: by },
        });
    }

    await tx.delete(tableCartLines).where(and(line, eq(tableCartLines.quantity, 0)));
    await tx.update(tableCarts).set({ updatedAt: new Date() }).where(eq(tableCarts.id, cartId));
  });
}

function clamp(quantity: number): number {
  return Math.max(0, Math.min(MAX_QUANTITY, Math.trunc(quantity)));
}

/** After paying: closes the table's cart, so its next guests start an empty one. */
export async function clearTable(db: Db, tableNumber: string, staffName: string): Promise<boolean> {
  const table = await activeTable(db, tableNumber);
  const cleared = await db
    .update(tableCarts)
    .set({ clearedAt: new Date(), clearedBy: staffName })
    .where(and(eq(tableCarts.tableId, table.id), isNull(tableCarts.clearedAt)))
    .returning({ id: tableCarts.id });
  return cleared.length > 0;
}

export interface TableOverview {
  readonly tableNumber: string;
  readonly area: 'INSIDE' | 'OUTSIDE' | null;
  readonly isActive: boolean;
  /** The open cart, or null for a free table. */
  readonly cart: { count: number; totalCents: number; updatedAt: string } | null;
}

/** Every table, active or not, with a summary of its open cart. */
export async function listTables(db: Db): Promise<TableOverview[]> {
  const tables = await db.select().from(restaurantTables);
  const carts = await db
    .select({
      tableId: tableCarts.tableId,
      updatedAt: tableCarts.updatedAt,
      count: sql<number>`coalesce(sum(${tableCartLines.quantity}), 0)::int`,
      totalCents: sql<number>`coalesce(sum(${tableCartLines.quantity} * ${menuItems.priceCents}), 0)::int`,
    })
    .from(tableCarts)
    .leftJoin(tableCartLines, eq(tableCartLines.cartId, tableCarts.id))
    .leftJoin(menuItems, eq(menuItems.id, tableCartLines.menuItemId))
    .where(isNull(tableCarts.clearedAt))
    .groupBy(tableCarts.tableId, tableCarts.updatedAt);
  const byTable = new Map(carts.map((c) => [c.tableId, c]));

  return tables
    .map((t) => {
      const cart = byTable.get(t.id);
      return {
        tableNumber: t.tableNumber,
        area: t.area,
        isActive: t.isActive,
        // An open cart emptied line by line is a free table again.
        cart:
          cart && Number(cart.count) > 0
            ? {
                count: Number(cart.count),
                totalCents: Number(cart.totalCents),
                updatedAt: cart.updatedAt.toISOString(),
              }
            : null,
      };
    })
    .sort((a, b) => a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true }));
}

export async function createTable(
  db: Db,
  input: { tableNumber: string; area?: 'INSIDE' | 'OUTSIDE' | null },
): Promise<void> {
  if (!isTableNumber(input.tableNumber)) {
    throw domainError('VALIDATION_FAILED', 'A table number is 1–8 letters, digits or dashes');
  }
  const [existing] = await db
    .select()
    .from(restaurantTables)
    .where(eq(restaurantTables.tableNumber, input.tableNumber));
  if (existing?.isActive) throw domainError('TABLE_EXISTS', 'That table already exists');
  if (existing) {
    // A table removed earlier comes back with its number, its card still works.
    await db
      .update(restaurantTables)
      .set({ isActive: true, area: input.area ?? existing.area })
      .where(eq(restaurantTables.id, existing.id));
    return;
  }
  await db.insert(restaurantTables).values({
    tableNumber: input.tableNumber,
    displayName: `Table ${input.tableNumber}`,
    qrToken: generateQrToken(),
    area: input.area ?? null,
  });
}

/**
 * Changes a table's area, or takes it out of (or back into) service. A table is
 * never deleted: past carts still point at it, and its printed card may be on a
 * table again one day. A table with guests' dishes on it cannot be removed.
 */
export async function updateTable(
  db: Db,
  tableNumber: string,
  change: { area?: 'INSIDE' | 'OUTSIDE' | null; isActive?: boolean },
): Promise<void> {
  if (!isTableNumber(tableNumber)) throw domainError('TABLE_NOT_FOUND', 'No such table');
  const [table] = await db
    .select()
    .from(restaurantTables)
    .where(eq(restaurantTables.tableNumber, tableNumber));
  if (!table) throw domainError('TABLE_NOT_FOUND', 'No such table', { tableNumber });

  if (change.isActive === false && table.isActive) {
    const cartId = await openCartId(db, table.id);
    if (cartId) {
      const [line] = await db.select().from(tableCartLines).where(eq(tableCartLines.cartId, cartId)).limit(1);
      if (line) throw domainError('TABLE_IN_USE', 'Clear the table before removing it');
    }
  }

  await db
    .update(restaurantTables)
    .set({
      ...(change.area !== undefined ? { area: change.area } : {}),
      ...(change.isActive !== undefined ? { isActive: change.isActive } : {}),
    })
    .where(eq(restaurantTables.id, table.id));
}

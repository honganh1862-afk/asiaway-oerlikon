import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestContext } from '../helpers/db';
import { menuItems, tableCarts } from '../../src/server/db/schema';
import { applyShippedMenu, loadShippedMenu } from '../../src/server/menu/sync-menu';
import { RESTAURANT_PROFILES } from '../../src/config/restaurant';
import {
  changeCartLine,
  clearTable,
  createTable,
  getTableCart,
  listTables,
  updateTable,
} from '../../src/server/services/table-cart-service';
import type { AppDatabase } from '../../src/server/db/client';

let ctx: TestContext;
let db: AppDatabase;
let springRolls: string;
let pho: string;

beforeAll(async () => {
  ctx = await createTestDatabase();
  db = ctx.db as unknown as AppDatabase;
  await applyShippedMenu(db, loadShippedMenu(resolve(process.cwd(), 'data'), RESTAURANT_PROFILES.winterthur));
  const items = await db.select().from(menuItems);
  springRolls = items.find((i) => i.dishNumber === '10')!.id;
  pho = items.find((i) => i.dishNumber?.startsWith('40'))!.id;
  await createTable(db, { tableNumber: '220', area: 'INSIDE' });
  await createTable(db, { tableNumber: '310' });
});

afterAll(async () => {
  await ctx.close();
});

describe('one shared cart per table', () => {
  it('starts empty, and two phones at the table add to the same list', async () => {
    expect((await getTableCart(db, '220', 'en')).lines).toEqual([]);

    await changeCartLine(db, '220', { menuItemId: springRolls, delta: 1 }, 'guest');
    await changeCartLine(db, '220', { menuItemId: springRolls, delta: 1 }, 'guest');
    await changeCartLine(db, '220', { menuItemId: pho, delta: 1 }, 'guest');

    const cart = await getTableCart(db, '220', 'de');
    expect(cart.lines.map((l) => [l.dishNumber, l.quantity])).toEqual([
      ['10', 2],
      [expect.stringMatching(/^40/), 1],
    ]);
    expect(cart.lines[0]!.name).toBe('Vegetarische Frühlingsrollen');
    expect(cart.count).toBe(3);
  });

  it('counts taps made at the same moment, rather than losing one', async () => {
    await Promise.all(
      Array.from({ length: 5 }, () => changeCartLine(db, '310', { menuItemId: pho, delta: 1 }, 'guest')),
    );
    expect((await getTableCart(db, '310', 'en')).lines[0]!.quantity).toBe(5);
  });

  it('lets staff add for a guest ordering from the printed card, and records who', async () => {
    await changeCartLine(db, '220', { menuItemId: pho, quantity: 3 }, { staff: 'Xuan' });
    const line = (await getTableCart(db, '220', 'en')).lines.find((l) => l.menuItemId === pho)!;
    expect(line).toMatchObject({ quantity: 3, changedBy: 'Xuan' });
  });

  it('removes a line taken down to nothing', async () => {
    await changeCartLine(db, '220', { menuItemId: pho, delta: -3 }, 'guest');
    expect((await getTableCart(db, '220', 'en')).lines.map((l) => l.menuItemId)).toEqual([springRolls]);
    // Taking away what is not there changes nothing.
    await changeCartLine(db, '220', { menuItemId: pho, delta: -1 }, 'guest');
    expect((await getTableCart(db, '220', 'en')).count).toBe(2);
  });

  it('stops a guest adding a sold-out dish, but not the staff', async () => {
    await db.update(menuItems).set({ isAvailable: false }).where(eq(menuItems.id, pho));
    await expect(changeCartLine(db, '220', { menuItemId: pho, delta: 1 }, 'guest')).rejects.toMatchObject({
      code: 'ITEMS_UNAVAILABLE',
    });
    await changeCartLine(db, '220', { menuItemId: pho, delta: 1 }, { staff: 'Edmond' });
    await changeCartLine(db, '220', { menuItemId: pho, quantity: 0 }, 'guest');
    await db.update(menuItems).set({ isAvailable: true }).where(eq(menuItems.id, pho));
  });

  it('refuses a table that does not exist', async () => {
    await expect(getTableCart(db, '999', 'en')).rejects.toMatchObject({ code: 'TABLE_NOT_FOUND' });
    await expect(
      changeCartLine(db, '999', { menuItemId: pho, delta: 1 }, 'guest'),
    ).rejects.toMatchObject({ code: 'TABLE_NOT_FOUND' });
  });

  it('shows the staff which tables have dishes waiting', async () => {
    const tables = await listTables(db);
    expect(tables.find((t) => t.tableNumber === '220')!.cart).toMatchObject({ count: 2 });
    expect(tables.find((t) => t.tableNumber === '310')!.cart).toMatchObject({ count: 5 });
  });

  it('clears a table after paying: its next guests start an empty cart, and who cleared it is kept', async () => {
    expect(await clearTable(db, '220', 'Tami')).toBe(true);
    expect((await getTableCart(db, '220', 'en')).lines).toEqual([]);
    expect((await listTables(db)).find((t) => t.tableNumber === '220')!.cart).toBeNull();

    const closed = await db.select().from(tableCarts);
    expect(closed.find((c) => c.clearedBy === 'Tami')).toBeTruthy();

    await changeCartLine(db, '220', { menuItemId: springRolls, delta: 1 }, 'guest');
    expect((await getTableCart(db, '220', 'en')).count).toBe(1);
    expect(await clearTable(db, '220', 'Tami')).toBe(true);
    expect(await clearTable(db, '220', 'Tami')).toBe(false);
  });
});

describe('managing the tables', () => {
  it('adds a table, and refuses one already in service', async () => {
    await createTable(db, { tableNumber: '140', area: 'OUTSIDE' });
    expect((await listTables(db)).find((t) => t.tableNumber === '140')).toMatchObject({
      area: 'OUTSIDE',
      isActive: true,
    });
    await expect(createTable(db, { tableNumber: '140' })).rejects.toMatchObject({ code: 'TABLE_EXISTS' });
    await expect(createTable(db, { tableNumber: 'not a table!' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('changes a table, and will not remove one with dishes on it', async () => {
    await updateTable(db, '140', { area: 'INSIDE' });
    expect((await listTables(db)).find((t) => t.tableNumber === '140')!.area).toBe('INSIDE');

    await expect(updateTable(db, '310', { isActive: false })).rejects.toMatchObject({ code: 'TABLE_IN_USE' });
    await clearTable(db, '310', 'Yen');
    await updateTable(db, '310', { isActive: false });
    await expect(getTableCart(db, '310', 'en')).rejects.toMatchObject({ code: 'TABLE_NOT_FOUND' });
  });

  it('brings a removed table back under its number', async () => {
    await createTable(db, { tableNumber: '310' });
    expect((await listTables(db)).find((t) => t.tableNumber === '310')!.isActive).toBe(true);
  });
});

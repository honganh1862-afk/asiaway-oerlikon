import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client';
import { allergens, menuCategories, menuItems } from '../db/schema';
import { RESTAURANT, type RestaurantProfile } from '../../config/restaurant';
import { ALLERGENS } from '../../domain/menu/allergens';
import { loadFoodMenus } from './food-menus';
import { mergeDrinks, parseDrinksCsv } from './drinks-import';
import { loadPhotoManifest, photoFor, type PhotoManifest } from './photos';
import type { ImportedMenu } from './import';

/**
 * The menu this deployment ships, read from data/: the Vietnamese menu and the
 * drinks, plus the Thai menu, the dessert card and the wine list where this
 * restaurant serves them.
 */
export interface ShippedMenu {
  readonly food: ImportedMenu;
  readonly drinks: ReturnType<typeof parseDrinksCsv>;
  readonly photos: PhotoManifest;
}

export function loadShippedMenu(
  dataDir = join(process.cwd(), 'data'),
  profile: Pick<RestaurantProfile, 'thaiMenu' | 'dessertMenu' | 'wineAndTea'> = RESTAURANT,
): ShippedMenu {
  const read = (file: string) => readFileSync(join(dataDir, file), 'utf8');
  const drinks = parseDrinksCsv(read('asiaway_drinks_menu.csv'));
  return {
    food: loadFoodMenus(dataDir, { thai: profile.thaiMenu, desserts: profile.dessertMenu }),
    drinks: profile.wineAndTea ? mergeDrinks(drinks, parseDrinksCsv(read('wine_and_tea_list.csv'))) : drinks,
    photos: loadPhotoManifest(dataDir),
  };
}

/**
 * Writes the shipped menu into the database.
 *
 * Idempotent: categories match on slug and dishes on external_key, so running
 * it twice changes nothing. It never deletes, and it never resets a dish marked
 * sold out.
 */
export async function applyShippedMenu(
  database: AppDatabase,
  menu: ShippedMenu,
  options: { reactivate?: boolean } = {},
): Promise<void> {
  // /api/admin/setup puts every shipped dish back on the menu, as it always
  // has; the boot sync leaves a dish the restaurant retired retired.
  const reactivate = options.reactivate ?? true;
  const { food, drinks, photos } = menu;

  for (const a of ALLERGENS) {
    await database
      .insert(allergens)
      .values({ code: a.code, nameEn: a.nameEn, nameDe: a.nameDe, nameVi: a.nameVi })
      .onConflictDoUpdate({
        target: allergens.code,
        set: { nameEn: a.nameEn, nameDe: a.nameDe, nameVi: a.nameVi },
      });
  }

  const categoryIds = new Map<string, string>();
  for (const c of [...food.categories, ...drinks.categories]) {
    const [row] = await database
      .insert(menuCategories)
      .values({
        slug: c.slug,
        kind: c.kind,
        nameEn: c.nameEn,
        nameDe: c.nameDe,
        nameVi: c.nameVi,
        sortOrder: c.sortOrder,
      })
      .onConflictDoUpdate({
        target: menuCategories.slug,
        set: {
          kind: c.kind,
          nameEn: c.nameEn,
          nameDe: c.nameDe,
          nameVi: c.nameVi,
          sortOrder: c.sortOrder,
          ...(reactivate ? { isActive: true } : {}),
        },
      })
      .returning({ id: menuCategories.id });
    categoryIds.set(c.slug, row!.id);
  }

  for (const item of [...food.items, ...drinks.items]) {
    await database
      .insert(menuItems)
      .values({
        categoryId: categoryIds.get(item.categorySlug)!,
        externalKey: item.externalKey,
        dishNumber: item.dishNumber || null,
        volume: item.volume ?? null,
        nameEn: item.nameEn,
        nameDe: item.nameDe,
        nameVi: item.nameVi,
        descriptionEn: item.descriptionEn,
        descriptionDe: item.descriptionDe,
        descriptionVi: item.descriptionVi,
        priceCents: item.priceCents,
        allergenCodes: [...item.allergenCodes],
        imagePath: photoFor(photos, item.dishNumber),
        sortOrder: item.sortOrder,
      })
      .onConflictDoUpdate({
        target: menuItems.externalKey,
        set: {
          categoryId: categoryIds.get(item.categorySlug)!,
          dishNumber: item.dishNumber || null,
          volume: item.volume ?? null,
          nameEn: item.nameEn,
          nameDe: item.nameDe,
          nameVi: item.nameVi,
          descriptionEn: item.descriptionEn,
          descriptionDe: item.descriptionDe,
          descriptionVi: item.descriptionVi,
          priceCents: item.priceCents,
          allergenCodes: [...item.allergenCodes],
          imagePath: photoFor(photos, item.dishNumber),
          sortOrder: item.sortOrder,
          ...(reactivate ? { isActive: true } : {}),
          updatedAt: new Date(),
          // Availability is NOT reset: an import must never quietly put a dish
          // the waiter marked sold out back on sale.
        },
      });
  }
}

/**
 * Loads the shipped menu if the database is missing any of its dishes.
 *
 * Why: the menu used to reach the database only through a manual call to
 * /api/admin/setup. When the Thai menu shipped, that call was never repeated
 * for Winterthur, so the code had the Thai dishes and the database did not, and
 * guests saw no Thai tab. Like the schema migrations, the menu now follows the
 * deployment on its own.
 *
 * It also runs when a dish still on the menu has a new price or photo in the
 * shipped files (the dessert photos reached a database that already had the
 * desserts this way).
 *
 * Nearly every cold start finds everything current and costs one SELECT. A dish
 * the restaurant has retired (inactive) still counts as present and is never
 * compared, so this never brings it back.
 */
export async function syncShippedMenuIfMissing(
  database: AppDatabase,
  menu: ShippedMenu = loadShippedMenu(),
): Promise<{ imported: boolean; missing: number; changed: number }> {
  const result = await database.execute(
    sql`SELECT external_key, is_active, price_cents, image_path FROM menu_items`,
  );
  type Row = { external_key: string; is_active: boolean; price_cents: number; image_path: string | null };
  const rows = (result as unknown as { rows?: Row[] }).rows ?? (result as any);
  const stored = new Map<string, Row>(
    (Array.isArray(rows) ? (rows as Row[]) : []).map((r) => [r.external_key, r]),
  );

  let missing = 0;
  let changed = 0;
  for (const item of [...menu.food.items, ...menu.drinks.items]) {
    const row = stored.get(item.externalKey);
    if (!row) missing += 1;
    // A retired dish is left alone: re-importing would put it back on the menu.
    else if (
      row.is_active &&
      (Number(row.price_cents) !== item.priceCents ||
        (row.image_path ?? null) !== photoFor(menu.photos, item.dishNumber))
    ) {
      changed += 1;
    }
  }
  if (missing === 0 && changed === 0) return { imported: false, missing: 0, changed: 0 };

  await applyShippedMenu(database, menu, { reactivate: false });
  return { imported: true, missing, changed };
}

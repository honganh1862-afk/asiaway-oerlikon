import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client';
import { allergens, menuCategories, menuItems } from '../db/schema';
import { RESTAURANT } from '../../config/restaurant';
import { ALLERGENS } from '../../domain/menu/allergens';
import { loadFoodMenus } from './food-menus';
import { parseDrinksCsv } from './drinks-import';
import { loadPhotoManifest, photoFor, type PhotoManifest } from './photos';
import type { ImportedMenu } from './import';

/**
 * The menu this deployment ships, read from data/: the Vietnamese menu, the
 * Thai one where this restaurant serves it, and the drinks.
 */
export interface ShippedMenu {
  readonly food: ImportedMenu;
  readonly drinks: ReturnType<typeof parseDrinksCsv>;
  readonly photos: PhotoManifest;
}

export function loadShippedMenu(dataDir = join(process.cwd(), 'data')): ShippedMenu {
  return {
    food: loadFoodMenus(dataDir, { thai: RESTAURANT.thaiMenu }),
    drinks: parseDrinksCsv(readFileSync(join(dataDir, 'asiaway_drinks_menu.csv'), 'utf8')),
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
export async function applyShippedMenu(database: AppDatabase, menu: ShippedMenu): Promise<void> {
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
          isActive: true,
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
          isActive: true,
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
 * Nearly every cold start finds everything present and costs one SELECT. A dish
 * the restaurant has retired (inactive) still counts as present, so this never
 * brings it back; only a dish the database has never seen triggers an import.
 */
export async function syncShippedMenuIfMissing(
  database: AppDatabase,
  menu: ShippedMenu = loadShippedMenu(),
): Promise<{ imported: boolean; missing: number }> {
  const result = await database.execute(sql`SELECT external_key FROM menu_items`);
  const rows =
    (result as unknown as { rows?: { external_key: string }[] }).rows ?? (result as any);
  const known = new Set<string>(
    (Array.isArray(rows) ? rows : []).map((r: { external_key: string }) => r.external_key),
  );

  const missing = [...menu.food.items, ...menu.drinks.items].filter(
    (i) => !known.has(i.externalKey),
  ).length;
  if (missing === 0) return { imported: false, missing: 0 };

  await applyShippedMenu(database, menu);
  return { imported: true, missing };
}

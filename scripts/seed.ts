/**
 * Demo / development seed.
 *
 *   npm run seed
 *
 * Creates DEMO data only: three test tables, plus the real menu from the
 * supplied CSVs.
 *
 * It deliberately does NOT invent the restaurant's real table list; that lives
 * in data/<restaurant>-tables.json and goes in through /api/admin/setup.
 * Running it against a production database is refused unless SEED_ALLOW_PROD is
 * set explicitly.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { PGlite } from '@electric-sql/pglite';
import { createPostgresDatabase, type AppDatabase } from '../src/server/db/client';
import { createPgliteDatabase } from '../src/server/db/pglite';
import { runMigrations } from '../src/server/db/migrator';
import { provisionSaturdayMenu } from '../src/server/menu/provision-saturday';
import { RESTAURANT } from '../src/config/restaurant';
import {
  allergens,
  menuCategories,
  menuItems,
  restaurantTables,
} from '../src/server/db/schema';
import { loadFoodMenus } from '../src/server/menu/food-menus';
import { MISSING_ALLERGEN_WARNING, parseDrinksCsv } from '../src/server/menu/drinks-import';
import { loadPhotoManifest, photoFor } from '../src/server/menu/photos';
import { ALLERGENS } from '../src/domain/menu/allergens';
import { generateQrToken } from '../src/domain/session/qr-token';
import { tableUrl } from '../src/domain/table';

const DEMO_TABLES = [
  { tableNumber: '01', displayName: 'Table 01 (DEMO)' },
  { tableNumber: '02', displayName: 'Table 02 (DEMO)' },
  { tableNumber: '03', displayName: 'Table 03 (DEMO)' },
];

async function seedMenu(db: AppDatabase): Promise<number> {
  const photos = loadPhotoManifest();
  const food = loadFoodMenus(resolve(process.cwd(), 'data'), { thai: RESTAURANT.thaiMenu });

  const drinksPath = resolve(process.cwd(), 'data/asiaway_drinks_menu.csv');
  const drinks = existsSync(drinksPath)
    ? parseDrinksCsv(readFileSync(drinksPath, 'utf8'))
    : { categories: [], items: [] };

  if (drinks.items.length > 0) console.warn(`\n  NOTE: ${MISSING_ALLERGEN_WARNING}\n`);

  const menu = {
    categories: [...food.categories, ...drinks.categories],
    items: [...food.items, ...drinks.items],
  };

  for (const a of ALLERGENS) {
    await db
      .insert(allergens)
      .values({ code: a.code, nameEn: a.nameEn, nameDe: a.nameDe, nameVi: a.nameVi })
      .onConflictDoUpdate({
        target: allergens.code,
        set: { nameEn: a.nameEn, nameDe: a.nameDe, nameVi: a.nameVi },
      });
  }

  const categoryIds = new Map<string, string>();
  for (const c of menu.categories) {
    const [row] = await db
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
        set: { nameEn: c.nameEn, nameDe: c.nameDe, nameVi: c.nameVi, sortOrder: c.sortOrder },
      })
      .returning({ id: menuCategories.id });
    categoryIds.set(c.slug, row!.id);
  }

  for (const item of menu.items) {
    await db
      .insert(menuItems)
      .values({
        categoryId: categoryIds.get(item.categorySlug)!,
        externalKey: item.externalKey,
        dishNumber: item.dishNumber,
        nameEn: item.nameEn,
        nameDe: item.nameDe,
        nameVi: item.nameVi,
        descriptionEn: item.descriptionEn,
        descriptionDe: item.descriptionDe,
        descriptionVi: item.descriptionVi,
        priceCents: item.priceCents,
        allergenCodes: [...item.allergenCodes],
        volume: item.volume ?? null,
        imagePath: photoFor(photos, item.dishNumber),
        sortOrder: item.sortOrder,
      })
      .onConflictDoUpdate({
        target: menuItems.externalKey,
        set: {
          dishNumber: item.dishNumber,
          nameEn: item.nameEn,
          nameDe: item.nameDe,
          nameVi: item.nameVi,
          priceCents: item.priceCents,
          allergenCodes: [...item.allergenCodes],
          volume: item.volume ?? null,
          imagePath: photoFor(photos, item.dishNumber),
          sortOrder: item.sortOrder,
          isActive: true,
        },
      });
  }

  return menu.items.length;
}

async function seedTables(db: AppDatabase, baseUrl: string) {
  const created: { tableNumber: string; url: string }[] = [];

  for (const table of DEMO_TABLES) {
    const existing = await db
      .select()
      .from(restaurantTables)
      .where(eq(restaurantTables.tableNumber, table.tableNumber));

    if (!existing[0]) {
      await db.insert(restaurantTables).values({ ...table, qrToken: generateQrToken() });
    }
    created.push({ tableNumber: table.tableNumber, url: tableUrl(baseUrl, table.tableNumber) });
  }

  return created;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3000';

  if (url && !process.env.SEED_ALLOW_PROD) {
    console.error(
      '\nRefusing to seed DEMO data into the database at DATABASE_URL.\n' +
        'This adds three DEMO tables beside the real ones.\n' +
        'Set SEED_ALLOW_PROD=1 if this really is a demo or staging database.\n',
    );
    process.exitCode = 1;
    return;
  }

  let db: AppDatabase;
  let close: () => Promise<void> = async () => {};

  if (url) {
    const created = createPostgresDatabase(url);
    db = created.db;
    close = async () => {
      await created.client.end();
    };
  } else {
    mkdirSync(resolve(process.cwd(), '.pglite'), { recursive: true });
    const client = new PGlite(resolve(process.cwd(), '.pglite/asiaway'));
    db = createPgliteDatabase(client).db;
    // Ledger-driven, so a migration added after this database was first created
    // still gets applied. Checking for one table only ever worked once.
    await runMigrations(db, (text) => client.exec(text));
    close = async () => client.close();
  }

  const itemCount = await seedMenu(db);
  const saturday = RESTAURANT.saturdayMenu ? await provisionSaturdayMenu(db) : { itemsApplied: 0 };
  const tables = await seedTables(db, baseUrl);

  console.log('\nSeed complete');
  console.log('=============');
  console.log(`Menu items      : ${itemCount}`);
  console.log(`Saturday dishes : ${saturday.itemsApplied}`);
  console.log(`Demo tables     : ${tables.length}`);
  console.log('\nTable links (open on a phone; print the cards with `npm run qr`):');
  for (const table of tables) console.log(`  Table ${table.tableNumber}  ${table.url}`);
  console.log('');

  await close();
}

main().catch((error: unknown) => {
  console.error('\nSeed FAILED:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

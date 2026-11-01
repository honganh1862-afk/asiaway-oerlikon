import { resolve } from 'node:path';
import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestContext } from '../helpers/db';
import { menuCategories, menuItems } from '../../src/server/db/schema';
import { loadFoodMenus } from '../../src/server/menu/food-menus';
import {
  applyShippedMenu,
  loadShippedMenu,
  syncShippedMenuIfMissing,
  type ShippedMenu,
} from '../../src/server/menu/sync-menu';
import type { AppDatabase } from '../../src/server/db/client';

const dataDir = resolve(process.cwd(), 'data');

let ctx: TestContext;
let db: AppDatabase;
let winterthur: ShippedMenu;

beforeAll(async () => {
  ctx = await createTestDatabase();
  db = ctx.db as unknown as AppDatabase;
  const shipped = loadShippedMenu(dataDir);
  winterthur = { ...shipped, food: loadFoodMenus(dataDir, { thai: true }) };
});

afterAll(async () => {
  await ctx.close();
});

describe('loading the shipped menu on boot', () => {
  it('adds the Thai menu to a database provisioned before it existed', async () => {
    // Winterthur as it was: set up with the Vietnamese menu and the drinks only.
    const before = { ...winterthur, food: loadFoodMenus(dataDir, { thai: false }) };
    await applyShippedMenu(db, before);
    expect(await db.select().from(menuCategories).where(like(menuCategories.slug, 'thai-%'))).toHaveLength(0);

    // A waiter has marked a Vietnamese dish sold out.
    const soldOutKey = before.food.items[0]!.externalKey;
    await db.update(menuItems).set({ isAvailable: false }).where(eq(menuItems.externalKey, soldOutKey));

    const result = await syncShippedMenuIfMissing(db, winterthur);
    expect(result).toEqual({ imported: true, missing: winterthur.food.items.length - before.food.items.length });

    const thai = await db.select().from(menuCategories).where(like(menuCategories.slug, 'thai-%'));
    expect(thai.length).toBe(winterthur.food.categories.length - before.food.categories.length);

    const [soldOut] = await db.select().from(menuItems).where(eq(menuItems.externalKey, soldOutKey));
    expect(soldOut!.isAvailable).toBe(false);
  });

  it('does nothing when every shipped dish is already there', async () => {
    expect(await syncShippedMenuIfMissing(db, winterthur)).toEqual({ imported: false, missing: 0 });
  });

  it('does not bring back a dish the restaurant retired', async () => {
    const key = winterthur.food.items[1]!.externalKey;
    await db.update(menuItems).set({ isActive: false }).where(eq(menuItems.externalKey, key));
    expect(await syncShippedMenuIfMissing(db, winterthur)).toEqual({ imported: false, missing: 0 });
    const [row] = await db.select().from(menuItems).where(eq(menuItems.externalKey, key));
    expect(row!.isActive).toBe(false);
  });
});

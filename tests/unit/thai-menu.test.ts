import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMenuCsv } from '../../src/server/menu/import';
import { loadFoodMenus } from '../../src/server/menu/food-menus';
import { menuTabFor } from '../../src/domain/menu/menus';
import { RESTAURANT_PROFILES } from '../../src/config/restaurant';

const dataDir = resolve(process.cwd(), 'data');
const thaiCsv = readFileSync(resolve(dataDir, 'thai_menu_EN_DE_VI.csv'), 'utf8');
const thai = parseMenuCsv(thaiCsv, { allowUndeclaredAllergens: true });
const byNumber = new Map(thai.items.map((i) => [i.dishNumber, i]));

describe('the Thai menu', () => {
  it('reads every printed dish but the one without a price', () => {
    const printed = new Set(thai.items.map((i) => i.dishNumber.split('.')[0]));
    expect(printed.size).toBe(28);
    // n° 261 Chicken Cashew Nuts has no price in the PDF, so it is not on sale.
    expect(printed.has('261')).toBe(false);
    expect(thai.items).toHaveLength(104);
  });

  it('makes each protein its own numbered dish at its printed price', () => {
    expect(byNumber.get('240.1')).toMatchObject({ nameDe: 'Green Curry – Tofu', priceCents: 2550 });
    expect(byNumber.get('240.3')).toMatchObject({ nameDe: 'Green Curry – Rind', priceCents: 2750 });
    expect(byNumber.get('240.6')).toMatchObject({ nameDe: 'Green Curry – Schwein', priceCents: 2650 });
    // Pad Thai is cheaper than the curries, protein for protein.
    expect(byNumber.get('270.1')?.priceCents).toBe(2350);
    // Laab Isaan: chicken and pork 23.50, beef and duck 25.50.
    expect(['222.1', '222.2', '222.3', '222.4'].map((n) => byNumber.get(n)?.priceCents)).toEqual([
      2350, 2550, 2350, 2550,
    ]);
    // The fried fish is one price with seven sauces.
    expect(thai.items.filter((i) => i.baseDishNumber === '280')).toHaveLength(7);
  });

  it('declares no allergens, because the printed menu declares none', () => {
    expect(thai.items.every((i) => i.allergenCodes.length === 0)).toBe(true);
  });

  it('still refuses a blank allergen cell on the Vietnamese menu, which declares them', () => {
    expect(() => parseMenuCsv(thaiCsv)).toThrow(/Allergens.*empty/);
  });

  it('never shares a dish number with the Vietnamese menu', () => {
    const both = loadFoodMenus(dataDir, { thai: true });
    const vietnamese = loadFoodMenus(dataDir, { thai: false });
    expect(both.items).toHaveLength(vietnamese.items.length + thai.items.length);
    const numbers = both.items.map((i) => i.dishNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(new Set(both.items.map((i) => i.externalKey)).size).toBe(both.items.length);
  });

  it('puts every Thai category on the Thai tab and leaves the Vietnamese ones alone', () => {
    expect(thai.categories.every((c) => menuTabFor(c) === 'THAI')).toBe(true);
    const vietnamese = loadFoodMenus(dataDir, { thai: false });
    expect(vietnamese.categories.every((c) => menuTabFor(c) === 'FOOD')).toBe(true);
    expect(menuTabFor({ slug: 'thai-curry', kind: 'DRINK' })).toBe('DRINK');
  });

  it('is served in Winterthur only', () => {
    expect(RESTAURANT_PROFILES.winterthur.thaiMenu).toBe(true);
    expect(RESTAURANT_PROFILES.oerlikon.thaiMenu).toBe(false);
  });
});

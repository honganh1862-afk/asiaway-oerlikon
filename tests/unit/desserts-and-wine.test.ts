import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMenuCsv } from '../../src/server/menu/import';
import { parseDrinksCsv } from '../../src/server/menu/drinks-import';
import { loadShippedMenu } from '../../src/server/menu/sync-menu';
import { RESTAURANT_PROFILES } from '../../src/config/restaurant';
import { menuTabFor } from '../../src/domain/menu/menus';

const dataDir = resolve(process.cwd(), 'data');
const read = (file: string) => readFileSync(resolve(dataDir, file), 'utf8');

describe('the dessert card', () => {
  const desserts = parseMenuCsv(read('dessert_menu_EN_DE_VI.csv'), { allowUndeclaredAllergens: true });
  const byNumber = new Map(desserts.items.map((i) => [i.dishNumber, i]));

  it('has every printed dessert, n° 130 to 137, on the food tab', () => {
    expect(new Set(desserts.items.map((i) => i.baseDishNumber))).toEqual(
      new Set(['130', '131', '132', '133', '134', '135', '136', '137']),
    );
    expect(desserts.categories.map((c) => menuTabFor(c))).toEqual(['FOOD']);
  });

  it('keeps the printed prices and allergens', () => {
    expect(byNumber.get('130')).toMatchObject({ priceCents: 1280, allergenCodes: ['A', 'C', 'G', 'H'] });
    expect(byNumber.get('131')).toMatchObject({ priceCents: 1450, allergenCodes: [] });
    expect(byNumber.get('134')).toMatchObject({ priceCents: 1250, allergenCodes: ['A', 'C', 'F', 'G', 'H'] });
  });

  it('sells each mochi and ice cream flavour on its own, so the kitchen knows which', () => {
    const mochi = desserts.items.filter((i) => i.baseDishNumber === '136');
    expect(mochi.map((i) => i.dishNumber)).toEqual(['136.1', '136.2', '136.3', '136.4', '136.5']);
    expect(mochi.every((i) => i.priceCents === 350)).toBe(true);
    expect(mochi[0]).toMatchObject({ nameDe: 'Frozen Mochi – Sesam', allergenCodes: ['N'] });

    const iceCream = desserts.items.filter((i) => i.baseDishNumber === '137');
    expect(iceCream).toHaveLength(3);
    expect(iceCream[0]).toMatchObject({ nameEn: 'Ice Cream - Coconut', priceCents: 450, allergenCodes: ['C', 'G', 'H'] });
  });
});

describe('the wine list and teas', () => {
  const wine = parseDrinksCsv(read('wine_and_tea_list.csv'));

  it('sells a wine by the glass and by the bottle as two items', () => {
    const verdejo = wine.items.filter((i) => i.nameEn.startsWith('Verdejo'));
    expect(verdejo.map((i) => [i.volume, i.priceCents])).toEqual([
      ['1 dl', 750],
      ['7 dl', 4800],
    ]);
    expect(new Set(verdejo.map((i) => i.externalKey)).size).toBe(2);
  });

  it('declares sulphites on every wine', () => {
    const wines = wine.items.filter((i) => i.categorySlug.endsWith('-wine'));
    expect(wines).toHaveLength(16);
    expect(wines.every((i) => i.allergenCodes.includes('O'))).toBe(true);
  });

  it('still refuses the same drink listed twice at the same volume', () => {
    const csv = read('wine_and_tea_list.csv');
    const line = 'Red Wine,Figuero 12 Crianza (Spanien),7 dl,72.00,O';
    expect(() => parseDrinksCsv(`${csv}${line}\n`)).toThrow(/duplicate item/i);
  });
});

describe('who serves them', () => {
  it('serves the desserts, the wine and the teas in Winterthur only', () => {
    const winterthur = loadShippedMenu(dataDir, RESTAURANT_PROFILES.winterthur);
    const oerlikon = loadShippedMenu(dataDir, RESTAURANT_PROFILES.oerlikon);
    const slugs = (m: typeof winterthur) => [...m.food.categories, ...m.drinks.categories].map((c) => c.slug);

    for (const slug of ['dessert', 'sparkling-wine', 'white-wine', 'rose-wine', 'red-wine', 'tea']) {
      expect(slugs(winterthur)).toContain(slug);
      expect(slugs(oerlikon)).not.toContain(slug);
    }
    // Oerlikon's menu is untouched.
    expect(oerlikon.drinks.items.map((i) => i.externalKey)).toEqual(
      parseDrinksCsv(read('asiaway_drinks_menu.csv')).items.map((i) => i.externalKey),
    );
  });
});

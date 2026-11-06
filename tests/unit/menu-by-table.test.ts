import { describe, expect, it } from 'vitest';
import { categoriesOnTab, foodMenusForTable, isOnTab } from '../../src/domain/menu/menus';
import { menuTabs, openTab, type Category } from '../../src/components/customer/useMenu';
import { RESTAURANT_PROFILES } from '../../src/config/restaurant';

const t = (key: string) => key;
const category = (slug: string, kind: 'FOOD' | 'DRINK' = 'FOOD'): Category => ({
  id: slug,
  slug,
  kind,
  name: slug,
  items: [],
});
const winterthurMenu = [
  category('appetizer'),
  category('dessert'),
  category('thai-curry'),
  category('beer', 'DRINK'),
];

describe('the food menu a Winterthur table is given', () => {
  it('reads it from the first digit of the table number', () => {
    expect(foodMenusForTable('110', true)).toBe('VIETNAMESE');
    expect(foodMenusForTable('136', true)).toBe('VIETNAMESE');
    expect(foodMenusForTable('210', true)).toBe('BOTH');
    expect(foodMenusForTable('233', true)).toBe('BOTH');
    expect(foodMenusForTable('310', true)).toBe('THAI');
    expect(foodMenusForTable('333', true)).toBe('THAI');
  });

  it('gives both to a guest with no table, or a table numbered otherwise', () => {
    expect(foodMenusForTable(null, true)).toBe('BOTH');
    expect(foodMenusForTable('410', true)).toBe('BOTH');
    expect(foodMenusForTable('A1', true)).toBe('BOTH');
  });

  it('applies in Winterthur only', () => {
    expect(RESTAURANT_PROFILES.winterthur.menuByTable).toBe(true);
    expect(RESTAURANT_PROFILES.oerlikon.menuByTable).toBe(false);
    expect(foodMenusForTable('310', false)).toBe('BOTH');
  });
});

describe('the tabs each table sees', () => {
  const ids = (menus: Parameters<typeof menuTabs>[2]) => menuTabs(winterthurMenu, t, menus).map((x) => x.id);

  it('shows the Vietnamese menu at 1xx, both at 2xx and the Thai menu at 3xx, with drinks on all', () => {
    expect(ids('VIETNAMESE')).toEqual(['FOOD', 'DRINK']);
    expect(ids('BOTH')).toEqual(['FOOD', 'THAI', 'DRINK']);
    expect(ids('THAI')).toEqual(['THAI', 'DRINK']);
  });

  it('shows the desserts on both food tabs, and nowhere else', () => {
    const dessert = category('dessert');
    expect(isOnTab(dessert, 'FOOD')).toBe(true);
    expect(isOnTab(dessert, 'THAI')).toBe(true);
    expect(isOnTab(dessert, 'DRINK')).toBe(false);
    expect(isOnTab(category('appetizer'), 'THAI')).toBe(false);
    expect(isOnTab(category('thai-curry'), 'FOOD')).toBe(false);
  });

  it('puts the desserts at the end of each food tab', () => {
    const slugs = (tab: 'FOOD' | 'THAI') => categoriesOnTab(winterthurMenu, tab).map((c) => c.slug);
    expect(slugs('FOOD')).toEqual(['appetizer', 'dessert']);
    expect(slugs('THAI')).toEqual(['thai-curry', 'dessert']);
  });

  it('opens the first tab when the remembered one is not at this table', () => {
    const thaiOnly = menuTabs(winterthurMenu, t, 'THAI');
    expect(openTab('FOOD', thaiOnly)).toBe('THAI');
    expect(openTab('DRINK', thaiOnly)).toBe('DRINK');
  });

  it('leaves a restaurant without the Thai menu as it was', () => {
    const oerlikon = [category('appetizer'), category('beer', 'DRINK')];
    expect(menuTabs(oerlikon, t, 'BOTH').map((x) => x.label)).toEqual(['menu.food', 'menu.drinks']);
  });
});

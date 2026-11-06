/**
 * Which printed menu a food category comes from.
 *
 * Winterthur serves the Vietnamese and the Thai menu, each on a tab of its own,
 * and which of them a table sees depends on its number (foodMenusForTable);
 * Oerlikon has no Thai categories, so it keeps a single food tab. The Thai categories are the ones whose slug starts with `thai-`
 * (CATEGORY_META in server/menu/import.ts).
 */
export const THAI_SLUG_PREFIX = 'thai-';

export function isThaiCategory(slug: string): boolean {
  return slug.startsWith(THAI_SLUG_PREFIX);
}

export type MenuTab = 'FOOD' | 'THAI' | 'DRINK';

/**
 * Which food menus a table is given. In Winterthur the first digit of the
 * table number decides, as the restaurant seats its guests:
 *
 *   1xx  the Vietnamese menu only
 *   2xx  both menus
 *   3xx  the Thai menu only
 *
 * A guest with no table (no card scanned), or at a table numbered otherwise,
 * sees both. Drinks are on every table.
 */
export type FoodMenus = 'VIETNAMESE' | 'THAI' | 'BOTH';

export function foodMenusForTable(tableNumber: string | null, byTable: boolean): FoodMenus {
  if (!byTable || !tableNumber) return 'BOTH';
  switch (tableNumber.trim()[0]) {
    case '1':
      return 'VIETNAMESE';
    case '3':
      return 'THAI';
    default:
      return 'BOTH';
  }
}

/**
 * Food served after either menu: the desserts are on the Vietnamese tab and on
 * the Thai tab alike, so every table finds them whichever menu it has.
 */
const SHARED_FOOD_SLUGS: ReadonlySet<string> = new Set(['dessert']);

/** The tab a category belongs to; for desserts, the Vietnamese one. */
export function menuTabFor(category: { slug: string; kind: 'FOOD' | 'DRINK' }): MenuTab {
  if (category.kind === 'DRINK') return 'DRINK';
  return isThaiCategory(category.slug) ? 'THAI' : 'FOOD';
}

/** Whether a category is shown on a tab: its own, and for desserts both food tabs. */
export function isOnTab(category: { slug: string; kind: 'FOOD' | 'DRINK' }, tab: MenuTab): boolean {
  if (category.kind === 'FOOD' && SHARED_FOOD_SLUGS.has(category.slug)) return tab !== 'DRINK';
  return menuTabFor(category) === tab;
}

/**
 * The categories shown on a tab, in menu order, with the desserts last: they
 * close the Thai menu as they close the Vietnamese one.
 */
export function categoriesOnTab<C extends { slug: string; kind: 'FOOD' | 'DRINK' }>(
  categories: readonly C[],
  tab: MenuTab,
): C[] {
  const shown = categories.filter((c) => isOnTab(c, tab));
  const shared = (c: C) => (c.kind === 'FOOD' && SHARED_FOOD_SLUGS.has(c.slug) ? 1 : 0);
  return shown.map((c, i) => [c, i] as const).sort((a, b) => shared(a[0]) - shared(b[0]) || a[1] - b[1]).map(([c]) => c);
}

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

export type MenuTab = 'FOOD' | 'THAI' | 'DESSERT' | 'DRINK';

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
 * The desserts follow either menu, so they have a tab of their own that every
 * table sees, between the food and the drinks.
 */
const DESSERT_SLUGS: ReadonlySet<string> = new Set(['dessert']);

export function menuTabFor(category: { slug: string; kind: 'FOOD' | 'DRINK' }): MenuTab {
  if (category.kind === 'DRINK') return 'DRINK';
  if (DESSERT_SLUGS.has(category.slug)) return 'DESSERT';
  return isThaiCategory(category.slug) ? 'THAI' : 'FOOD';
}

/** The categories shown on a tab, in menu order. */
export function categoriesOnTab<C extends { slug: string; kind: 'FOOD' | 'DRINK' }>(
  categories: readonly C[],
  tab: MenuTab,
): C[] {
  return categories.filter((c) => menuTabFor(c) === tab);
}

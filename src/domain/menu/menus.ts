/**
 * Which printed menu a food category comes from.
 *
 * Winterthur serves the Vietnamese and the Thai menu, and a guest sees each on a
 * tab of its own; Oerlikon has no Thai categories, so it keeps a single food
 * tab. The Thai categories are the ones whose slug starts with `thai-`
 * (CATEGORY_META in server/menu/import.ts).
 */
export const THAI_SLUG_PREFIX = 'thai-';

export function isThaiCategory(slug: string): boolean {
  return slug.startsWith(THAI_SLUG_PREFIX);
}

export type MenuTab = 'FOOD' | 'THAI' | 'DRINK';

export function menuTabFor(category: { slug: string; kind: 'FOOD' | 'DRINK' }): MenuTab {
  if (category.kind === 'DRINK') return 'DRINK';
  return isThaiCategory(category.slug) ? 'THAI' : 'FOOD';
}

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMenuCsv, type ImportedMenu } from './import';

/**
 * The food this restaurant serves: always the Vietnamese menu, plus the Thai
 * menu and the dessert card where they are offered (Winterthur). All import
 * through the same path, so a Thai dish or a dessert is stored, priced and
 * ordered exactly like a Vietnamese one.
 */
export function loadFoodMenus(
  dataDir: string,
  options: { thai: boolean; desserts?: boolean },
): ImportedMenu {
  const read = (file: string) => readFileSync(join(dataDir, file), 'utf8');
  const menus: ImportedMenu[] = [parseMenuCsv(read('menu_trilingual_EN_DE_VI.csv'))];

  // The dessert card declares allergens on some desserts and not on others
  // (Mango Sticky Rice, the Taro and Mango ice cream); those say "please ask".
  if (options.desserts) {
    menus.push(parseMenuCsv(read('dessert_menu_EN_DE_VI.csv'), { allowUndeclaredAllergens: true }));
  }

  // The Thai menu prints no allergens and tells guests to ask the staff.
  if (options.thai) {
    menus.push(parseMenuCsv(read('thai_menu_EN_DE_VI.csv'), { allowUndeclaredAllergens: true }));
  }

  return mergeMenus(menus);
}

function mergeMenus(menus: readonly ImportedMenu[]): ImportedMenu {
  if (menus.length === 1) return menus[0]!;

  const keys = new Set<string>();
  for (const item of menus.flatMap((m) => m.items)) {
    if (keys.has(item.externalKey)) throw new Error(`Dish "${item.externalKey}" is on two menus`);
    keys.add(item.externalKey);
  }

  return {
    categories: menus.flatMap((m) => m.categories).sort((a, b) => a.sortOrder - b.sortOrder),
    items: menus.flatMap((m) => m.items),
    stats: {
      csvRows: menus.reduce((n, m) => n + m.stats.csvRows, 0),
      itemsProduced: menus.reduce((n, m) => n + m.stats.itemsProduced, 0),
      rowsSplit: menus.reduce((n, m) => n + m.stats.rowsSplit, 0),
    },
  };
}

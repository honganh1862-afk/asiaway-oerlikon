import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMenuCsv, type ImportedMenu } from './import';

/**
 * The food this restaurant serves: always the Vietnamese menu, plus the Thai
 * menu where it is offered (Winterthur). Both import through the same path, so
 * a Thai dish is stored, priced and ordered exactly like a Vietnamese one.
 */
export function loadFoodMenus(dataDir: string, options: { thai: boolean }): ImportedMenu {
  const vietnamese = parseMenuCsv(readFileSync(join(dataDir, 'menu_trilingual_EN_DE_VI.csv'), 'utf8'));
  if (!options.thai) return vietnamese;

  // The Thai menu prints no allergens and tells guests to ask the staff.
  const thai = parseMenuCsv(readFileSync(join(dataDir, 'thai_menu_EN_DE_VI.csv'), 'utf8'), {
    allowUndeclaredAllergens: true,
  });
  return {
    categories: [...vietnamese.categories, ...thai.categories],
    items: [...vietnamese.items, ...thai.items],
    stats: {
      csvRows: vietnamese.stats.csvRows + thai.stats.csvRows,
      itemsProduced: vietnamese.stats.itemsProduced + thai.stats.itemsProduced,
      rowsSplit: vietnamese.stats.rowsSplit + thai.stats.rowsSplit,
    },
  };
}

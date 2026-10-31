'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { menuTabFor, type MenuTab } from '../../domain/menu/menus';
import type { Locale } from '../../i18n/locales';
import type { Translator } from '../../i18n';

export interface MenuItem {
  id: string;
  dishNumber: string | null;
  volume: string | null;
  name: string;
  /** The dish's Vietnamese name, printed under the translated one in the classic menu. */
  nameVi: string;
  description: string;
  priceCents: number;
  allergenCodes: string[];
  imagePath: string | null;
  isAvailable: boolean;
}

export interface Category {
  id: string;
  slug: string;
  kind: 'FOOD' | 'DRINK';
  name: string;
  items: MenuItem[];
}

/**
 * The guest menu in the guest's language, shared by the classic and the modern
 * view so both always show the same dishes and prices.
 *
 * The last copy is kept for the visit, so moving between the views, opening a
 * dish and coming back, or a weak signal for a moment never leaves the guest
 * looking at an empty page: the copy shows at once, and a fresh one replaces it
 * when it arrives. The menu only changes when the restaurant loads it again, so
 * it is fetched once per screen rather than polled.
 */
export function useMenu(locale: Locale) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState(false);

  // The page opens in the default language and switches to the guest's saved
  // one a moment later, so two loads can be in flight. Only the latest may land:
  // otherwise a German screen could end up listing English dishes.
  const latest = useRef(0);
  const load = useCallback(() => {
    const request = ++latest.current;
    const kept = readKeptMenu(locale);
    setError(false);
    setCategories(kept);
    fetch(`/api/menu?lang=${locale}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('menu'))))
      .then((data) => {
        if (request !== latest.current) return;
        setCategories(data.categories);
        keepMenu(locale, data.categories);
      })
      // With a copy on screen, a failed refresh is not worth an error.
      .catch(() => request === latest.current && !kept && setError(true));
  }, [locale]);

  useEffect(load, [load]);

  return { categories, error, reload: load };
}

const keptKey = (locale: Locale) => `aw.menu.${locale}`;

function readKeptMenu(locale: Locale): Category[] | null {
  try {
    const raw = window.sessionStorage.getItem(keptKey(locale));
    return raw ? (JSON.parse(raw) as Category[]) : null;
  } catch {
    return null;
  }
}

function keepMenu(locale: Locale, categories: Category[]): void {
  try {
    window.sessionStorage.setItem(keptKey(locale), JSON.stringify(categories));
  } catch {
    // Full or blocked storage: the next screen simply fetches again.
  }
}

/**
 * Where both printed menus are served (Winterthur), each gets its own tab:
 * Vietnamesisch · Thai · Getränke. Elsewhere it stays Speisen · Getränke.
 */
export function menuTabs(categories: Category[] | null, t: Translator): { id: MenuTab; label: string }[] {
  const hasThai = (categories ?? []).some((c) => menuTabFor(c) === 'THAI');
  return hasThai
    ? [
        { id: 'FOOD', label: t('menu.vietnamese') },
        { id: 'THAI', label: t('menu.thai') },
        { id: 'DRINK', label: t('menu.drinks') },
      ]
    : [
        { id: 'FOOD', label: t('menu.food') },
        { id: 'DRINK', label: t('menu.drinks') },
      ];
}

/** The tab a guest last had open, kept for the visit so switching views keeps their place. */
const TAB_KEY = 'aw.menuTab';

export function readMenuTab(): MenuTab {
  try {
    const stored = window.sessionStorage.getItem(TAB_KEY);
    if (stored === 'FOOD' || stored === 'THAI' || stored === 'DRINK') return stored;
  } catch {
    // Blocked storage: start on the first tab.
  }
  return 'FOOD';
}

export function writeMenuTab(tab: MenuTab): void {
  try {
    window.sessionStorage.setItem(TAB_KEY, tab);
  } catch {
    // A convenience only.
  }
}

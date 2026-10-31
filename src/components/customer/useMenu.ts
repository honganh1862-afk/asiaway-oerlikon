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
 * view so both always show the same dishes, prices and sold-out marks.
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
    setError(false);
    setCategories(null);
    fetch(`/api/menu?lang=${locale}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('menu'))))
      .then((data) => request === latest.current && setCategories(data.categories))
      .catch(() => request === latest.current && setError(true));
  }, [locale]);

  useEffect(load, [load]);

  // Availability changes while the guest is browsing, so the menu refreshes
  // quietly and a dish sold out at the pass stops being offered.
  useEffect(() => {
    const id = setInterval(() => {
      const request = ++latest.current;
      fetch(`/api/menu?lang=${locale}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && request === latest.current && setCategories(data.categories))
        .catch(() => undefined);
    }, 60_000);
    return () => clearInterval(id);
  }, [locale]);

  return { categories, error, reload: load };
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

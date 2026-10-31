'use client';

import { useEffect, useMemo, useState } from 'react';
import { useCustomer } from '../../../components/customer/CustomerProvider';
import { MenuBook } from '../../../components/customer/MenuBook';
import { MenuStyleSwitch } from '../../../components/customer/MenuStyleSwitch';
import {
  menuTabs,
  readMenuTab,
  useMenu,
  writeMenuTab,
} from '../../../components/customer/useMenu';
import { menuTabFor, type MenuTab } from '../../../domain/menu/menus';

/** The classic menu: one book per printed menu, turned page by page. */
export default function ClassicMenuPage() {
  const { t, locale, addToCart, quantityOf } = useCustomer();
  const { categories, error, reload } = useMenu(locale);
  const [chosenTab, setChosenTab] = useState<MenuTab>('FOOD');

  useEffect(() => setChosenTab(readMenuTab()), []);

  const tabs = menuTabs(categories, t);
  // A tab remembered from the other view may not exist here (no Thai menu).
  const tab = tabs.some((x) => x.id === chosenTab) ? chosenTab : 'FOOD';
  const shown = useMemo(
    () => (categories ?? []).filter((c) => menuTabFor(c) === tab),
    [categories, tab],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">{t('menu.title')}</h1>

      <div className="flex shrink-0 items-center gap-3 px-4 pt-2">
        <div role="tablist" className="flex min-w-0 flex-1">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setChosenTab(id);
                writeMenuTab(id);
              }}
              className={`min-h-tap flex-auto border-b-2 px-2 text-[13px] font-semibold ${
                tab === id ? 'border-book-red text-book-chalk' : 'border-book-chalk/15 text-book-dim'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <MenuStyleSwitch current="classic" t={t} dark compact />
      </div>

      {error ? (
        <div className="m-4 space-y-3 border border-book-chalk/20 p-4 text-book-chalk">
          <p className="text-sm">{t('common.error')}</p>
          <button className="btn border border-book-chalk/50 text-book-chalk" onClick={reload}>
            {t('common.retry')}
          </button>
        </div>
      ) : !categories ? (
        <div className="m-4 flex-1 animate-pulse bg-book-board" aria-busy="true">
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      ) : shown.length === 0 ? (
        <p className="m-4 border border-book-chalk/20 p-4 text-sm text-book-chalk">
          {tab === 'DRINK' ? t('menu.drinks.empty') : t('menu.empty')}
        </p>
      ) : (
        // One book per menu: each keeps its own place.
        <MenuBook
          key={tab}
          tab={tab}
          categories={shown}
          locale={locale}
          t={t}
          quantityOf={quantityOf}
          onAdd={(item) =>
            addToCart({
              menuItemId: item.id,
              name: item.name,
              dishNumber: item.dishNumber,
              unitPriceCents: item.priceCents,
            })
          }
        />
      )}
    </div>
  );
}

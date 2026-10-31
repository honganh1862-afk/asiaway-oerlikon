'use client';

import Link from 'next/link';
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { RESTAURANT } from '../../config/restaurant';
import type { MenuTab } from '../../domain/menu/menus';
import type { MessageKey, Translator } from '../../i18n';
import type { Locale } from '../../i18n/locales';
import { formatPrice } from '../../lib/format';
import { photoSrcSet, prefersLowData } from '../../lib/photo';
import { DishPhoto } from './DishPhoto';
import { PAYING } from './GuestJourney';
import type { Category, MenuItem } from './useMenu';

/**
 * The classic menu: the printed menu as a book, one page at a time.
 *
 * It looks like the menu on the table — chalk on a blackboard, red lowercase
 * section titles, "n° 14 - Chili Squid" with the Vietnamese name beneath — and
 * a page turns over from its right edge when the guest swipes or taps an
 * arrow. Every dish can still go straight into the cart.
 *
 * The pages are not fixed: the dishes are measured at the width of the guest's
 * screen and poured into as many pages as they need, so nothing is cut off on a
 * small phone and nothing is lost when the language changes. A page that still
 * overflows (very large text settings) scrolls rather than hiding a dish.
 */

type Page =
  | { kind: 'cover' }
  | { kind: 'contents' }
  | { kind: 'photo'; category: Category; item: MenuItem }
  | { kind: 'text'; category: Category; items: MenuItem[]; continued: boolean }
  | { kind: 'back' };

interface Heights {
  items: Map<string, number>;
  titles: Map<string, number>;
  continued: number;
}

/** pt-5 + pb-3 + the page-number line: kept in step with the classes on TextFrame. */
const PAGE_CHROME = 20 + 12 + 24;
const TURN_MS = 700;
/** A page spans the phone's width, up to the guest frame's 28rem. */
const PHOTO_SIZES = '(max-width: 28rem) 100vw, 28rem';

const COVER_TITLE: Record<MenuTab, MessageKey> = {
  FOOD: 'book.cover.vietnamese',
  THAI: 'book.cover.thai',
  DRINK: 'book.cover.drinks',
};

export function MenuBook({
  tab,
  categories,
  locale,
  t,
  quantityOf,
  onAdd,
}: {
  tab: MenuTab;
  categories: Category[];
  locale: Locale;
  t: Translator;
  quantityOf: (menuItemId: string) => number;
  onAdd: (item: MenuItem) => void;
}) {
  // The Vietnamese name sits under the dish on the Vietnamese menu only, and
  // not when the guest is already reading in Vietnamese.
  const showVi = tab === 'FOOD' && locale !== 'vi';
  // Drinks show allergen codes only where they apply, as on the printed list.
  const drinks = tab === 'DRINK';

  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () =>
      setSize((s) =>
        s && s.w === el.clientWidth && s.h === el.clientHeight
          ? s
          : { w: el.clientWidth, h: el.clientHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Text set before the web fonts arrive is a different height, so measure again
  // once they have.
  const [fontsLoaded, setFontsLoaded] = useState(0);
  useEffect(() => {
    let live = true;
    document.fonts?.ready.then(() => live && setFontsLoaded((n) => n + 1));
    return () => {
      live = false;
    };
  }, []);

  const measurer = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<Heights | null>(null);

  useLayoutEffect(() => {
    const root = measurer.current;
    if (!root) return;
    const items = new Map<string, number>();
    root.querySelectorAll<HTMLElement>('[data-measure-item]').forEach((el) => {
      items.set(el.dataset.measureItem!, el.offsetHeight);
    });
    const titles = new Map<string, number>();
    root.querySelectorAll<HTMLElement>('[data-measure-title]').forEach((el) => {
      titles.set(el.dataset.measureTitle!, el.offsetHeight);
    });
    const continued = root.querySelector<HTMLElement>('[data-measure-continued]')?.offsetHeight ?? 0;
    setHeights({ items, titles, continued });
  }, [categories, size?.w, fontsLoaded]);

  const pages = useMemo<Page[]>(() => {
    if (!heights || !size) return [];
    // A few pixels of slack, so a rounding difference never pushes the last
    // dish of a page under the page number.
    const available = size.h - PAGE_CHROME - 4;
    const result: Page[] = [{ kind: 'cover' }, { kind: 'contents' }];

    for (const category of categories) {
      // Like the printed menu, a section opens on a full-page photograph of one
      // of its dishes, where there is one.
      const hero = category.items.find((i) => i.imagePath);
      if (hero) result.push({ kind: 'photo', category, item: hero });

      // Every section starts on a fresh page, also like the printed menu.
      let items: MenuItem[] = [];
      let continued = false;
      let used = heights.titles.get(category.id) ?? 0;
      for (const item of category.items) {
        const height = heights.items.get(item.id) ?? 0;
        if (items.length > 0 && used + height > available) {
          result.push({ kind: 'text', category, items, continued });
          items = [];
          continued = true;
          used = heights.continued;
        }
        items.push(item);
        used += height;
      }
      result.push({ kind: 'text', category, items, continued });
    }
    // The back cover: where to pay, and a review if they enjoyed it.
    result.push({ kind: 'back' });
    return result;
  }, [heights, size, categories]);

  const contents = useMemo(
    () => [
      ...categories.map((category) => ({
        id: category.id,
        name: category.name,
        page: pages.findIndex((p) => 'category' in p && p.category.id === category.id),
      })),
      // Last in the list, as on the back cover: paying, and a review.
      {
        id: 'back',
        name: t(PAYING.step),
        page: pages.length - 1,
      },
    ],
    [categories, pages, t],
  );

  // The guest's page, kept for the visit: opening a dish and coming back, or
  // looking at the cart, returns them to where they were reading.
  const storageKey = `aw.bookPage.${tab}`;
  const [index, setIndex] = useState(() => readPage(storageKey));
  const current = pages.length > 0 ? Math.min(index, pages.length - 1) : 0;

  useEffect(() => {
    if (pages.length > 0) writePage(storageKey, current);
  }, [current, pages.length, storageKey]);

  // The pages are poured again whenever the book changes size — the cart bar
  // appearing under it with the first dish, a phone turned sideways. The guest
  // stays with the dish they were reading rather than on the same page number,
  // which by then may hold different dishes.
  const anchor = useRef<string | null>(null);
  const pouredFor = useRef(pages);
  useLayoutEffect(() => {
    if (pages !== pouredFor.current) {
      pouredFor.current = pages;
      const found = anchor.current ? pages.findIndex((p) => holds(p, anchor.current!)) : -1;
      if (found >= 0 && found !== current) {
        setIndex(found);
        return;
      }
    }
    const page = pages[current];
    if (page) anchor.current = anchorOf(page);
  }, [pages, current]);

  // The first dish added brings the cart bar up under the book, which pours
  // the pages again: keep the dish just added in view, not just the page's top.
  const add = (item: MenuItem, from: Page) => {
    anchor.current = from.kind === 'photo' ? anchorOf(from) : item.id;
    onAdd(item);
  };

  // Fetch the photographs either side of the open page, so a turn uncovers a
  // picture rather than a blackboard that a picture then pops onto.
  useEffect(() => {
    for (const page of [pages[current + 1], pages[current - 1]]) {
      if (page?.kind !== 'photo' || !page.item.imagePath) continue;
      const img = new Image();
      img.sizes = PHOTO_SIZES;
      img.srcset = photoSrcSet(page.item.imagePath, prefersLowData()) ?? '';
      img.src = page.item.imagePath;
    }
  }, [pages, current]);

  // A page turn in progress: the leaf is the page that swings over the spine.
  // Forward, the page being left lifts away and uncovers the next one; back,
  // the previous page swings back down over the current one.
  const [turn, setTurn] = useState<{ from: number; to: number } | null>(null);
  const leaf = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);

  const goTo = useCallback(
    (target: number) => {
      if (turn || pages.length === 0) return;
      const to = Math.max(0, Math.min(pages.length - 1, target));
      if (to === current) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setIndex(to);
        return;
      }
      setTurn({ from: current, to });
    },
    [turn, pages.length, current],
  );

  useLayoutEffect(() => {
    if (!turn || !leaf.current) return;
    const forward = turn.to > turn.from;
    const open = 'rotateY(0deg)';
    const over = 'rotateY(-180deg)';
    const timing: KeyframeAnimationOptions = {
      duration: TURN_MS,
      easing: 'cubic-bezier(0.45, 0.05, 0.25, 1)',
      fill: 'both',
    };
    const swing = leaf.current.animate(
      forward ? [{ transform: open }, { transform: over }] : [{ transform: over }, { transform: open }],
      timing,
    );
    const darken = shade.current?.animate(
      forward ? [{ opacity: 0 }, { opacity: 0.7 }] : [{ opacity: 0.7 }, { opacity: 0 }],
      timing,
    );
    // A browser that is not painting (a background tab, a webview) can hold
    // the finish event back, so a timer makes sure the turn still completes.
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setIndex(turn.to);
      setTurn(null);
    };
    swing.onfinish = finish;
    const fallback = window.setTimeout(finish, TURN_MS + 80);
    return () => {
      done = true;
      window.clearTimeout(fallback);
      swing.onfinish = null;
      swing.cancel();
      darken?.cancel();
    };
  }, [turn]);

  // Swipe left for the next page, right for the previous one. A swipe that
  // started on a dish or a button must not also open or press it.
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  // Arrow keys turn pages too.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.key === 'ArrowRight') goTo(current + 1);
      else if (event.key === 'ArrowLeft') goTo(current - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, current]);

  const coverImage =
    tab === 'FOOD'
      ? '/images/classic/cover.webp'
      : (categories.flatMap((c) => c.items).find((i) => i.imagePath)?.imagePath ?? null);

  const renderPage = (number: number) => {
    const page = pages[number];
    if (!page) return null;
    switch (page.kind) {
      case 'cover':
        return <CoverPage title={t(COVER_TITLE[tab])} image={coverImage} t={t} />;
      case 'contents':
        return <ContentsPage entries={contents} number={number + 1} onJump={goTo} t={t} />;
      case 'back':
        return <BackCoverPage t={t} />;
      case 'photo':
        return (
          <PhotoPage
            page={page}
            showVi={showVi}
            quantity={quantityOf(page.item.id)}
            onAdd={(item) => add(item, page)}
            t={t}
          />
        );
      case 'text':
        return (
          <TextFrame number={number + 1}>
            {page.continued ? (
              <ContinuedTitle name={page.category.name} t={t} />
            ) : (
              <SectionTitle name={page.category.name} />
            )}
            {page.items.map((item) => (
              <DishEntry
                key={item.id}
                item={item}
                showVi={showVi}
                drink={drinks}
                quantity={quantityOf(item.id)}
                onAdd={(dish) => add(dish, page)}
                t={t}
              />
            ))}
          </TextFrame>
        );
    }
  };

  const forward = turn ? turn.to > turn.from : false;
  const underneath = turn ? (forward ? turn.to : turn.from) : current;
  const turning = turn ? (forward ? turn.from : turn.to) : null;
  const ready = pages.length > 0;
  const atStart = current === 0;
  const atEnd = current >= pages.length - 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={stage}
        className="relative mx-4 mt-3 min-h-0 flex-1 touch-pan-y select-none [perspective:2200px]"
        onPointerDown={(e) => {
          pointer.current = { x: e.clientX, y: e.clientY };
          swiped.current = false;
        }}
        onPointerUp={(e) => {
          const start = pointer.current;
          pointer.current = null;
          if (!start) return;
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.3) {
            swiped.current = true;
            goTo(current + (dx < 0 ? 1 : -1));
          }
        }}
        onPointerCancel={() => {
          pointer.current = null;
        }}
        // With a mouse, dragging across a photo or a dish would start the
        // browser's own drag-and-drop and cancel the swipe.
        onDragStart={(e) => e.preventDefault()}
        onClickCapture={(e) => {
          if (swiped.current) {
            e.preventDefault();
            e.stopPropagation();
            swiped.current = false;
          }
        }}
      >
        {/* The edges of the pages still to come, so it reads as a book. */}
        {!atEnd && (
          <>
            <div aria-hidden="true" className="absolute inset-0 translate-x-[6px] translate-y-[5px] bg-[#232627]" />
            <div aria-hidden="true" className="absolute inset-0 translate-x-[3px] translate-y-[2.5px] bg-[#2d3133]" />
          </>
        )}

        {ready ? (
          <>
            <div key={underneath} className="absolute inset-0">
              {renderPage(underneath)}
            </div>

            {turning !== null && (
              <div
                ref={leaf}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-10 origin-left [transform-style:preserve-3d]"
                style={{ transform: forward ? 'rotateY(0deg)' : 'rotateY(-180deg)' }}
              >
                <div className="absolute inset-0 [backface-visibility:hidden]">
                  {renderPage(turning)}
                  <div
                    ref={shade}
                    className="absolute inset-0 bg-gradient-to-l from-black/80 via-black/40 to-black/10 opacity-0"
                  />
                </div>
                {/* The back of the page, seen as it passes the spine. */}
                <div className="absolute inset-0 bg-book-board bg-[url('/images/classic/chalkboard.webp')] bg-cover [backface-visibility:hidden] [transform:rotateY(180deg)]">
                  <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-black/20" />
                </div>
              </div>
            )}
          </>
        ) : (
          <PageShell>
            <div className="absolute inset-0 animate-pulse bg-white/5" aria-busy="true">
              <span className="sr-only">{t('common.loading')}</span>
            </div>
          </PageShell>
        )}

        {/* Every dish set once, out of sight, at the width of a page: these
            heights decide where each page ends. */}
        {size && (
          <div
            ref={measurer}
            aria-hidden="true"
            className="pointer-events-none invisible absolute left-0 top-0 h-0 overflow-hidden px-5"
            style={{ width: size.w }}
          >
            <div data-measure-continued="">
              <ContinuedTitle name="M" t={t} />
            </div>
            {categories.map((category) => (
              <Fragment key={category.id}>
                <div data-measure-title={category.id}>
                  <SectionTitle name={category.name} />
                </div>
                {category.items.map((item) => (
                  <div key={item.id} data-measure-item={item.id}>
                    <DishEntry item={item} showVi={showVi} drink={drinks} quantity={0} onAdd={() => {}} t={t} />
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-2">
        <button
          type="button"
          aria-label={t('book.prev')}
          disabled={!ready || atStart}
          onClick={() => goTo(current - 1)}
          className="flex h-11 w-11 items-center justify-center border border-book-chalk/40 text-book-chalk disabled:opacity-25"
        >
          {ARROW_LEFT}
        </button>

        <button
          type="button"
          disabled={!ready}
          onClick={() => goTo(1)}
          className="flex min-h-tap items-center gap-2 px-2 text-sm text-book-chalk/90 disabled:opacity-25"
        >
          {CONTENTS_ICON}
          {t('book.contents')}
        </button>

        <p className="min-w-[4.5rem] text-center text-sm tabular-nums text-book-dim">
          <span aria-hidden="true">{ready ? `${current + 1} / ${pages.length}` : '–'}</span>
          <span className="sr-only" aria-live="polite">
            {ready ? t('book.page', { page: current + 1, count: pages.length }) : ''}
          </span>
        </p>

        <button
          type="button"
          aria-label={t('book.next')}
          disabled={!ready || atEnd}
          onClick={() => goTo(current + 1)}
          className="flex h-11 w-11 items-center justify-center border border-book-chalk/40 text-book-chalk disabled:opacity-25"
        >
          {ARROW_RIGHT}
        </button>
      </div>
    </div>
  );
}

/** What identifies a page across a re-pour: its first dish, or what it is. */
function anchorOf(page: Page): string {
  if (page.kind === 'text') return page.items[0]?.id ?? page.category.id;
  if (page.kind === 'photo') return `photo:${page.item.id}`;
  return page.kind;
}

function holds(page: Page, anchor: string): boolean {
  if (page.kind === 'text') return page.items.some((i) => i.id === anchor);
  return anchorOf(page) === anchor;
}

function readPage(key: string): number {
  try {
    const value = Number(window.sessionStorage.getItem(key));
    return Number.isInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writePage(key: string, page: number): void {
  try {
    window.sessionStorage.setItem(key, String(page));
  } catch {
    // A convenience only.
  }
}

/** A sheet of blackboard, darkened towards the spine on its left. */
function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-book-board bg-[url('/images/classic/chalkboard.webp')] bg-cover bg-center shadow-[0_14px_34px_rgba(0,0,0,0.6)]">
      {children}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-black/50 to-transparent"
      />
    </div>
  );
}

function TextFrame({ number, children }: { number: number; children: ReactNode }) {
  return (
    <PageShell>
      <div className="absolute inset-0 flex flex-col px-5 pb-3 pt-5">
        {/* Widened into the margin and padded back, so the count badges that
            sit over the + buttons' corners are not clipped by the scroller. */}
        <div className="-mx-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
        <p className="h-6 shrink-0 pt-2 text-center text-xs leading-4 text-book-dim">— {number} —</p>
      </div>
    </PageShell>
  );
}

function SectionTitle({ name }: { name: string }) {
  return (
    <h2 className="pb-3 text-center font-book text-[2rem] font-bold lowercase leading-tight text-book-red">
      {name}
    </h2>
  );
}

function ContinuedTitle({ name, t }: { name: string; t: Translator }) {
  return (
    <p className="pb-1 text-center font-book text-sm lowercase leading-6 text-book-red/90">
      {name} · {t('book.continued')}
    </p>
  );
}

/** One dish, set the way the printed menu sets it. */
function DishEntry({
  item,
  showVi,
  drink,
  quantity,
  onAdd,
  t,
}: {
  item: MenuItem;
  showVi: boolean;
  drink: boolean;
  quantity: number;
  onAdd: (item: MenuItem) => void;
  t: Translator;
}) {
  const declared = item.allergenCodes.length > 0;
  return (
    <div className="flex items-start gap-3 border-t border-book-chalk/10 py-2.5">
      <Link
        href={`/menu/${item.id}`}
        className={`min-w-0 flex-1 ${item.isAvailable ? '' : 'opacity-50'}`}
      >
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 font-display text-[15px] leading-snug text-book-chalk">
            {item.dishNumber && <span className="text-book-dim">n° {item.dishNumber} - </span>}
            <span className="font-semibold">{item.name}</span>
            {item.volume && <span className="text-book-dim"> · {item.volume}</span>}
          </p>
          <span className="shrink-0 font-display text-[15px] font-semibold tabular-nums text-book-chalk">
            {formatPrice(item.priceCents)}
          </span>
        </div>
        <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[13px] leading-snug">
          <span className="min-w-0 italic text-book-dim">{showVi && item.nameVi !== item.name ? item.nameVi : ''}</span>
          {/* Never let "no codes" read as "no allergens" on a dish; a drink
              without codes shows none, as on the printed drinks list. */}
          {(declared || !drink) && (
            <span
              className={`shrink-0 text-xs ${
                declared ? 'font-semibold tracking-wide text-book-red' : 'italic text-book-dim'
              }`}
            >
              {declared ? item.allergenCodes.join(' ') : t('menu.allergens.ask')}
            </span>
          )}
        </div>
        {item.description && (
          <p className="mt-1 text-[13px] font-normal leading-snug text-book-dim">{item.description}</p>
        )}
        {!item.isAvailable && (
          <p className="mt-1 text-xs font-semibold uppercase tracking-section text-book-red">
            {t('menu.soldOut')}
          </p>
        )}
      </Link>
      <AddButton item={item} quantity={quantity} onAdd={onAdd} t={t} />
    </div>
  );
}

function AddButton({
  item,
  quantity,
  onAdd,
  t,
}: {
  item: MenuItem;
  quantity: number;
  onAdd: (item: MenuItem) => void;
  t: Translator;
}) {
  if (!item.isAvailable) return <span className="w-11 shrink-0" aria-hidden="true" />;
  return (
    <button
      type="button"
      onClick={() => onAdd(item)}
      aria-label={
        quantity > 0
          ? `${t('item.add')}: ${item.name} (${t('book.inCart', { count: quantity })})`
          : `${t('item.add')}: ${item.name}`
      }
      className={`relative flex h-11 w-11 shrink-0 items-center justify-center border text-xl leading-none transition-colors ${
        quantity > 0
          ? 'border-book-red text-book-red'
          : 'border-book-chalk/40 text-book-chalk hover:bg-book-chalk/10'
      }`}
    >
      +
      {quantity > 0 && (
        <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center bg-book-red px-1 font-display text-xs font-semibold text-white">
          {quantity}
        </span>
      )}
    </button>
  );
}

function CoverPage({ title, image, t }: { title: string; image: string | null; t: Translator }) {
  return (
    <PageShell>
      {image && (
        <DishPhoto
          src={image}
          alt=""
          sizes={PHOTO_SIZES}
          eager
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 via-black/40 to-transparent px-6 pb-16 pt-8 text-center">
        <p className="font-display text-[1.6rem] font-light uppercase leading-tight tracking-[0.14em] text-book-chalk">
          {title}
        </p>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-6 pb-6 pt-20">
        <p className="text-xs uppercase tracking-[0.25em] text-book-chalk/90">{t('book.welcome')}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/asiaway-logo.png" alt={t('app.name')} className="mt-2 h-10 w-auto" />
        <p className="mt-5 flex items-center gap-2 text-sm text-book-dim">
          {t('book.swipeHint')} <span aria-hidden="true">→</span>
        </p>
      </div>
    </PageShell>
  );
}

function ContentsPage({
  entries,
  number,
  onJump,
  t,
}: {
  entries: { id: string; name: string; page: number }[];
  number: number;
  onJump: (page: number) => void;
  t: Translator;
}) {
  return (
    <TextFrame number={number}>
      <h2 className="pb-4 text-center font-book text-[2rem] font-bold lowercase leading-tight text-book-red">
        {t('book.contents')}
      </h2>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => onJump(entry.page)}
              className="flex min-h-tap w-full items-baseline gap-2 py-1.5 text-left text-book-chalk"
            >
              <span className="font-display text-base font-semibold">{entry.name}</span>
              <span aria-hidden="true" className="mb-1 min-w-4 flex-1 border-b border-dotted border-book-chalk/40" />
              <span className="font-display tabular-nums text-book-dim">{entry.page + 1}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs leading-relaxed text-book-dim">{t('book.tapDish')}</p>
      <p className="mt-1 text-xs leading-relaxed text-book-dim">{t('menu.vatNote')}</p>
    </TextFrame>
  );
}

function BackCoverPage({ t }: { t: Translator }) {
  return (
    <PageShell>
      <div className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto px-6 py-6 text-center">
        <p className="font-book text-[2.4rem] font-bold lowercase leading-tight text-book-red">
          {t('book.thanks')}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/asiaway-logo.png" alt={t('app.name')} className="mt-3 h-9 w-auto" />

        <div className="mt-8 w-full border-y border-book-chalk/20 py-5">
          <p className="text-xs uppercase tracking-[0.25em] text-book-dim">{t('book.finished')}</p>
          <p className="mt-2 font-display text-lg font-semibold leading-snug text-book-chalk">
            {t(PAYING.body)}
          </p>
          <Link
            href="/pay"
            className="mt-4 inline-flex min-h-tap items-center gap-2 border border-book-chalk/60 px-4 text-sm font-semibold uppercase tracking-section text-book-chalk"
          >
            {t(PAYING.step)}
            <span aria-hidden="true">→</span>
          </Link>
        </div>

        {RESTAURANT.reviewUrl && (
          <div className="mt-6">
            <p aria-hidden="true" className="text-xl tracking-[0.25em] text-book-red">
              ★★★★★
            </p>
            <p className="mt-1 font-display font-semibold text-book-chalk">{t('review.title')}</p>
            <a
              href={RESTAURANT.reviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              // The brand red, not the chalk red: white text needs the darker one.
              className="mt-3 inline-flex min-h-tap items-center gap-2 bg-brand-600 px-4 text-sm font-semibold uppercase tracking-section text-white"
            >
              {t('review.button')}
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function PhotoPage({
  page,
  showVi,
  quantity,
  onAdd,
  t,
}: {
  page: Extract<Page, { kind: 'photo' }>;
  showVi: boolean;
  quantity: number;
  onAdd: (item: MenuItem) => void;
  t: Translator;
}) {
  const { item, category } = page;
  return (
    <PageShell>
      <DishPhoto
        src={item.imagePath!}
        alt={item.name}
        sizes={PHOTO_SIZES}
        eager
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Captioned top right, as in the printed menu. */}
      <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/85 via-black/50 to-transparent px-5 pb-14 pt-5 text-right [text-shadow:0_1px_4px_rgba(0,0,0,0.9)]">
        <p className="font-book text-sm lowercase text-book-red">{category.name}</p>
        <p className="mt-1 font-display text-lg leading-snug text-book-chalk">
          {item.dishNumber && <span className="text-book-chalk/80">n° {item.dishNumber} - </span>}
          <span className="font-semibold">{item.name}</span>
        </p>
        {showVi && item.nameVi !== item.name && (
          <p className="text-sm italic text-book-chalk/90">{item.nameVi}</p>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-5 pb-5 pt-14">
        <span className="font-display text-2xl font-semibold tabular-nums text-book-chalk">
          {formatPrice(item.priceCents)}
        </span>
        {item.isAvailable ? (
          <button
            type="button"
            onClick={() => onAdd(item)}
            className={`flex min-h-tap items-center gap-2 border px-4 text-sm font-semibold uppercase tracking-section ${
              quantity > 0 ? 'border-book-red bg-book-red text-white' : 'border-book-chalk/70 text-book-chalk'
            }`}
          >
            + {t('item.addShort')}
            {quantity > 0 && <span className="font-display tabular-nums">· {quantity}</span>}
          </button>
        ) : (
          <span className="text-sm font-semibold uppercase tracking-section text-book-red">
            {t('menu.soldOut')}
          </span>
        )}
      </div>
    </PageShell>
  );
}

const arrow = (d: string) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={d} />
  </svg>
);

const ARROW_LEFT = arrow('M15 5l-7 7 7 7');
const ARROW_RIGHT = arrow('M9 5l7 7-7 7');
const CONTENTS_ICON = arrow('M4 6h16M4 12h16M4 18h10');

'use client';

import Link from 'next/link';
import type { Translator } from '../../i18n';

/**
 * Classic | Modern, at the top of both menus, so a guest who picked one can
 * try the other without going back to the start. Compact, it is two icons:
 * the classic menu needs the width for its tabs.
 */
export function MenuStyleSwitch({
  current,
  t,
  dark = false,
  compact = false,
}: {
  current: 'classic' | 'modern';
  t: Translator;
  dark?: boolean;
  compact?: boolean;
}) {
  const styles = [
    { id: 'classic', href: '/menu/classic', label: t('menu.style.classic'), icon: BOOK_ICON },
    { id: 'modern', href: '/menu/modern', label: t('menu.style.modern'), icon: LIST_ICON },
  ] as const;

  return (
    <nav
      aria-label={t('menu.style.label')}
      className={`inline-flex shrink-0 border ${dark ? 'border-book-chalk/30' : 'border-ink/15'}`}
    >
      {styles.map((style) => {
        const active = style.id === current;
        return (
          <Link
            key={style.id}
            href={style.href}
            replace
            aria-current={active ? 'page' : undefined}
            aria-label={compact ? style.label : undefined}
            title={compact ? style.label : undefined}
            className={`flex min-h-tap min-w-tap items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-section ${
              compact ? '' : 'px-3'
            } ${
              active
                ? dark
                  ? 'bg-book-chalk text-book-table'
                  : 'bg-ink text-white'
                : dark
                  ? 'text-book-chalk/80'
                  : 'text-ink-muted'
            }`}
          >
            {style.icon}
            {!compact && style.label}
          </Link>
        );
      })}
    </nav>
  );
}

const icon = (path: React.ReactNode) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {path}
  </svg>
);

/** An open book. */
const BOOK_ICON = icon(
  <>
    <path d="M3 5.5c2.5-1.2 5.5-1.2 9 .8 3.5-2 6.5-2 9-.8v13c-2.5-1.2-5.5-1.2-9 .8-3.5-2-6.5-2-9-.8z" />
    <path d="M12 6.3v13" />
  </>,
);

/** A list with thumbnails. */
const LIST_ICON = icon(
  <>
    <rect x="3" y="4" width="6" height="6" />
    <rect x="3" y="14" width="6" height="6" />
    <path d="M13 6h8M13 9h5M13 16h8M13 19h5" />
  </>,
);

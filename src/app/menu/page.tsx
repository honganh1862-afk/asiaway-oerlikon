'use client';

import Link from 'next/link';
import { useCustomer } from '../../components/customer/CustomerProvider';
import { GuestJourney, PayPrompt } from '../../components/customer/GuestJourney';
import { RESTAURANT } from '../../config/restaurant';

/**
 * Where the table's QR code lands: the two ways to read the menu.
 *
 * Classic turns pages like the printed menu on the table; Modern is one long,
 * scrollable list with photos. Both carry the same dishes and the same cart.
 */
export default function MenuChooserPage() {
  const { t } = useCustomer();

  return (
    <div className="space-y-5">
      <header>
        <p className="h-label">{t('choose.welcome')}</p>
        <h1 className="mt-1 text-2xl font-semibold leading-tight">
          {RESTAURANT.thaiMenu ? t('choose.title.both') : t('choose.title.vietnamese')}
        </h1>
      </header>

      <GuestJourney current={1} t={t} />

      <p className="font-semibold">{t('choose.body')}</p>

      <Link
        href="/menu/classic"
        className="group relative block overflow-hidden bg-book-table text-book-chalk shadow-lg
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                   focus-visible:outline-brand-600"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/classic/cover.webp"
          alt=""
          className="h-56 w-full object-cover object-[50%_35%] opacity-80 transition-transform duration-500
                     group-hover:scale-[1.03] motion-reduce:transition-none"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="font-book text-3xl lowercase text-book-red">{t('choose.classic')}</p>
          <p className="mt-1 text-sm text-book-chalk/90">{t('choose.classic.body')}</p>
          <span className="mt-3 inline-flex min-h-tap items-center gap-2 border border-book-chalk/60 px-4 text-sm font-semibold uppercase tracking-section">
            {BOOK_ICON}
            {t('choose.open')}
          </span>
        </div>
      </Link>

      <Link
        href="/menu/modern"
        className="group block border border-ink/15 bg-surface shadow-sm
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                   focus-visible:outline-brand-600"
      >
        {/* A strip of dish photos, the way the modern menu opens. */}
        <div className="grid h-28 grid-cols-3 gap-0.5 overflow-hidden bg-surface-sunken">
          {/* A Thai dish only where the Thai menu is served. */}
          {[
            '/images/menu/dish-14-480.webp',
            '/images/menu/dish-43-480.webp',
            RESTAURANT.thaiMenu ? '/images/menu/dish-200-480.webp' : '/images/menu/dish-17-480.webp',
          ].map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" className="h-full w-full object-cover" />
          ))}
        </div>
        <div className="p-4">
          <p className="font-display text-2xl font-semibold text-ink">{t('choose.modern')}</p>
          <p className="mt-1 text-sm text-ink-muted">{t('choose.modern.body')}</p>
          <span className="mt-3 inline-flex min-h-tap items-center gap-2 bg-brand-600 px-4 text-sm font-semibold uppercase tracking-section text-white group-hover:bg-brand-700">
            {LIST_ICON}
            {t('choose.open')}
          </span>
        </div>
      </Link>

      <PayPrompt t={t} />
    </div>
  );
}

const svg = (path: React.ReactNode) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {path}
  </svg>
);

const BOOK_ICON = svg(
  <>
    <path d="M3 5.5c2.5-1.2 5.5-1.2 9 .8 3.5-2 6.5-2 9-.8v13c-2.5-1.2-5.5-1.2-9 .8-3.5-2-6.5-2-9-.8z" />
    <path d="M12 6.3v13" />
  </>,
);

const LIST_ICON = svg(
  <>
    <rect x="3" y="4" width="6" height="6" />
    <rect x="3" y="14" width="6" height="6" />
    <path d="M13 6h8M13 9h5M13 16h8M13 19h5" />
  </>,
);

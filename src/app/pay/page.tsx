'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCustomer } from '../../components/customer/CustomerProvider';
import { GuestJourney, PAYING } from '../../components/customer/GuestJourney';
import { RESTAURANT } from '../../config/restaurant';
import { readTableCookie } from '../../domain/table';

/**
 * The last step of the visit: paying, then — if they enjoyed it — a review.
 *
 * It says where to pay and, when the guest came in through their table's
 * card, gives the table number to tell the cashier, who finds the bill by it.
 *
 * The review invitation goes to every guest alike. Google does not allow
 * sending only the happy ones, and a plain invitation is what it asks for.
 */
export default function PayPage() {
  const { t } = useCustomer();
  const [table, setTable] = useState<string | null>(null);

  useEffect(() => setTable(readTableCookie(document.cookie)), []);

  return (
    <div className="space-y-5">
      <GuestJourney current={4} t={t} />

      <section className="space-y-3">
        <h1 className="h-section">{t(PAYING.title)}</h1>
        <div className="border-l-4 border-brand-600 bg-brand-50 p-4">
          <p className="flex items-start gap-3">
            <span aria-hidden="true" className="mt-0.5 shrink-0 text-brand-600">
              {COUNTER_ICON}
            </span>
            <span>{t(PAYING.body)}</span>
          </p>
        </div>
        {table && (
          <div className="card flex items-center justify-between gap-3 p-4">
            <span className="text-sm text-ink-muted">
              {RESTAURANT.payment === 'counter' ? t('pay.counter.table') : t('pay.table.table')}
            </span>
            <span className="font-display text-3xl font-bold text-ink">{table}</span>
          </div>
        )}
      </section>

      {RESTAURANT.reviewUrl && (
        <section className="card space-y-2 p-4 text-center">
          <p aria-hidden="true" className="text-2xl tracking-[0.2em] text-brand-600">
            ★★★★★
          </p>
          <h2 className="text-lg font-semibold">{t('review.title')}</h2>
          <p className="text-sm text-ink-muted">{t('review.body')}</p>
          <a
            href={RESTAURANT.reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary mt-2 w-full gap-2"
          >
            {t('review.button')}
            <span aria-hidden="true">↗</span>
          </a>
        </section>
      )}

      <p className="text-center font-display text-lg font-semibold text-ink">{t('pay.thanks')}</p>

      <Link href="/menu" className="btn-secondary w-full">
        {t('cart.continue')}
      </Link>
    </div>
  );
}

/** A counter with a till on it. */
const COUNTER_ICON = (
  <svg
    viewBox="0 0 24 24"
    className="h-6 w-6"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 20h18M5 20v-7h14v7" />
    <rect x="8" y="5" width="8" height="5" />
    <path d="M10 13v3M14 13v3" />
  </svg>
);

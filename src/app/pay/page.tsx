'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useCustomer } from '../../components/customer/CustomerProvider';
import { GuestJourney } from '../../components/customer/GuestJourney';
import { RESTAURANT } from '../../config/restaurant';
import { formatTime } from '../../lib/format';

/**
 * The last step of the visit: paying, then — if they enjoyed it — a review.
 *
 * Where guests pay at the counter (Winterthur), it says where the counter is
 * and gives the table number to tell the cashier. Where they pay at the table
 * (Oerlikon), it asks for the bill; pressing again after the request is
 * harmless, as the server returns the original moment and alerts nobody twice.
 *
 * The review invitation goes to every guest alike. Google does not allow
 * sending only the happy ones, and a plain invitation is what it asks for.
 */
export default function PayPage() {
  const { t } = useCustomer();
  const [table, setTable] = useState<string | null>(null);
  const [requestedAt, setRequestedAt] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const atCounter = RESTAURANT.payment === 'counter';

  const load = useCallback(() => {
    fetch('/api/session')
      .then((r) => r.json())
      .then((data) => {
        if (!data.active) return;
        setTable(data.tableNumber);
        setRequestedAt(data.checkoutRequestedAt ?? null);
      })
      .catch(() => undefined);
  }, []);

  useEffect(load, [load]);

  async function askForBill() {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch('/api/checkout-request', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        setError(t('common.error'));
        return;
      }
      setRequestedAt(data.requestedAt);
    } catch {
      setError(t('common.offline'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <GuestJourney current={4} t={t} />

      {atCounter ? (
        <section className="space-y-3">
          <h1 className="h-section">{t('pay.counter.title')}</h1>
          <div className="border-l-4 border-brand-600 bg-brand-50 p-4">
            <p className="flex items-start gap-3">
              <span aria-hidden="true" className="mt-0.5 shrink-0 text-brand-600">
                {COUNTER_ICON}
              </span>
              <span>{t('pay.counter.body')}</span>
            </p>
          </div>
          {/* The cashier finds the table's bill by its number. */}
          {table && (
            <div className="card flex items-center justify-between gap-3 p-4">
              <span className="text-sm text-ink-muted">{t('pay.counter.table')}</span>
              <span className="font-display text-3xl font-bold text-ink">{table}</span>
            </div>
          )}
        </section>
      ) : (
        <section className="space-y-3" aria-live="polite">
          {requestedAt ? (
            <>
              <h1 className="h-section">{t('checkout.requested.title')}</h1>
              <p className="text-ink-muted">
                {t('checkout.requested.body', { time: formatTime(requestedAt) })}
              </p>
            </>
          ) : (
            <>
              <h1 className="h-section">{t('checkout.title')}</h1>
              <p className="text-ink-muted">{t('checkout.body')}</p>
              {error && (
                <p className="rounded-xl bg-danger-50 p-3 text-sm text-danger-500" role="alert">
                  {error}
                </p>
              )}
              {/* Asking needs the table, which only the QR code tells us. */}
              {table ? (
                <button className="btn-primary w-full" onClick={() => void askForBill()} disabled={sending}>
                  {sending ? t('staffCall.calling') : t('checkout.confirm')}
                </button>
              ) : (
                <p className="text-sm text-ink-muted">{t('pay.table.noSession')}</p>
              )}
            </>
          )}
        </section>
      )}

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

'use client';

import Link from 'next/link';
import { RESTAURANT } from '../../config/restaurant';
import type { MessageKey, Translator } from '../../i18n';

/**
 * The guest's visit in four steps, from the QR code to paying: choose, the
 * waiter takes the order, enjoy, pay. Shown where a guest stops to wonder what
 * happens next — the start, the cart and the paying page — with where they are
 * now marked, so nobody waits for food they never ordered or sits waiting for
 * a bill that is never coming to the table.
 */
export function GuestJourney({ current, t }: { current: 1 | 2 | 3 | 4; t: Translator }) {
  const steps: { label: MessageKey; href: string | null }[] = [
    { label: 'journey.choose', href: '/menu' },
    { label: 'journey.order', href: '/cart' },
    { label: 'journey.enjoy', href: null },
    { label: PAYING.step, href: '/pay' },
  ];

  return (
    <nav aria-label={t('journey.label')}>
      <ol className="grid grid-cols-4">
        {steps.map((step, index) => {
          const number = index + 1;
          const done = number < current;
          const here = number === current;
          const body = (
            <>
              <span
                className={`relative z-10 flex h-8 w-8 items-center justify-center font-display text-sm font-semibold ${
                  here
                    ? 'bg-brand-600 text-white'
                    : done
                      ? 'bg-ink text-white'
                      : 'border border-ink/25 bg-surface text-ink-muted'
                }`}
              >
                {done ? '✓' : number}
              </span>
              <span
                className={`mt-1.5 px-0.5 text-center text-xs leading-tight ${
                  here ? 'font-semibold text-ink' : 'text-ink-muted'
                }`}
              >
                {t(step.label)}
              </span>
            </>
          );
          return (
            <li key={step.label} className="relative flex flex-col items-center">
              {/* The line joining this step to the next. */}
              {number < steps.length && (
                <span
                  aria-hidden="true"
                  className={`absolute left-1/2 top-4 h-px w-full ${done ? 'bg-ink' : 'bg-ink/20'}`}
                />
              )}
              {step.href ? (
                <Link
                  href={step.href}
                  aria-current={here ? 'step' : undefined}
                  className="flex min-h-tap w-full flex-col items-center"
                >
                  {body}
                </Link>
              ) : (
                <span aria-current={here ? 'step' : undefined} className="flex w-full flex-col items-center">
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * "Finished your meal? Pay at the counter", leading to the paying page: at the
 * foot of the start screen, the modern menu and the cart, where a guest who
 * has eaten will look.
 */
export function PayPrompt({ t }: { t: Translator }) {
  return (
    <Link
      href="/pay"
      className="flex min-h-tap items-center gap-3 border border-ink/15 bg-surface-sunken p-4 hover:bg-brand-50"
    >
      <span aria-hidden="true" className="text-brand-600">
        {CARD_ICON}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{t('pay.cta.title')}</span>
        <span className="block text-sm text-ink-muted">
          {t(PAYING.cta)}
        </span>
      </span>
      <span aria-hidden="true" className="text-xl text-ink-muted">
        →
      </span>
    </Link>
  );
}

/** How this restaurant is paid, in the words each screen needs. */
export const PAYING: Readonly<{
  step: MessageKey;
  title: MessageKey;
  body: MessageKey;
  cta: MessageKey;
}> =
  RESTAURANT.payment === 'table'
    ? {
        step: 'journey.pay.table',
        title: 'pay.table.title',
        body: 'pay.table.body',
        cta: 'pay.cta.table',
      }
    : RESTAURANT.counterPlace === 'stairs'
      ? {
          step: 'journey.pay.counter',
          title: 'pay.counter.title',
          body: 'pay.counter.body.stairs',
          cta: 'pay.cta.counter.stairs',
        }
      : {
          step: 'journey.pay.counter',
          title: 'pay.counter.title',
          body: 'pay.counter.body',
          cta: 'pay.cta.counter',
        };

const CARD_ICON = (
  <svg
    viewBox="0 0 24 24"
    className="h-7 w-7"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="6" width="18" height="12" rx="1.5" />
    <path d="M3 10h18M7 15h3" />
  </svg>
);

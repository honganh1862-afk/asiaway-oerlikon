'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useCustomer } from '../customer/CustomerProvider';
import { LOCALE_LABELS, LOCALES, type Locale } from '../../i18n/locales';
import { staffFetch } from './useStaff';

/** The staff screens' frame: who is signed in, the language, and signing out. */
export function StaffShell({ name, children }: { name: string | null; children: ReactNode }) {
  const { t, locale, setLocale } = useCustomer();
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-surface-sunken">
      <header
        className="sticky top-0 z-30 border-b border-ink/10 bg-surface/95 px-4 backdrop-blur"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex min-h-14 items-center justify-between gap-3">
          <Link href="/staff" className="flex min-h-tap items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/asiaway-logo.png" alt={t('app.name')} className="h-6 w-auto" />
            <span className="text-sm font-semibold uppercase tracking-section text-ink-muted">
              {t('staff.title')}
            </span>
          </Link>
          <select
            aria-label={t('lang.choose')}
            className="min-h-tap rounded-xl border border-ink/20 bg-surface px-2 text-sm"
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
          >
            {LOCALES.map((code) => (
              <option key={code} value={code}>
                {LOCALE_LABELS[code]}
              </option>
            ))}
          </select>
        </div>
        {name && (
          <div className="flex items-center justify-between pb-2 text-sm text-ink-muted">
            <span>{t('staff.signedInAs', { name })}</span>
            <button
              type="button"
              className="min-h-tap px-2 underline underline-offset-4"
              onClick={async () => {
                await staffFetch('/api/staff/session', { method: 'DELETE' });
                window.location.href = '/staff';
              }}
            >
              {t('staff.signOut')}
            </button>
          </div>
        )}
      </header>
      <main className="flex-1 space-y-5 p-4">{children}</main>
    </div>
  );
}

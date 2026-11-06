'use client';

import { useState } from 'react';
import { useCustomer } from '../customer/CustomerProvider';
import { StaffApiError, staffFetch, type StaffSession } from './useStaff';

/** Sign-in: tap your name, type the PIN. */
export function SignIn({ session, onSignedIn }: { session: StaffSession; onSignedIn: () => void }) {
  const { t } = useCustomer();
  const [name, setName] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!session.configured) {
    return <p className="card p-4 text-sm">{t('staff.signIn.notSetUp')}</p>;
  }

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name || !pin) return;
        setBusy(true);
        setError(null);
        try {
          await staffFetch('/api/staff/session', { method: 'POST', body: JSON.stringify({ name, pin }) });
          onSignedIn();
        } catch (err) {
          setPin('');
          setError(
            err instanceof StaffApiError && err.code === 'RATE_LIMITED'
              ? t('staff.signIn.limited')
              : t('staff.signIn.wrong'),
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1 className="h-section">{t('staff.signIn.title')}</h1>

      <fieldset className="space-y-2">
        <legend className="h-label">{t('staff.signIn.who')}</legend>
        <div className="grid grid-cols-2 gap-2">
          {session.staff.map((person) => (
            <button
              key={person}
              type="button"
              aria-pressed={name === person}
              onClick={() => setName(person)}
              className={`min-h-tap rounded-xl border px-3 py-3 text-base font-semibold ${
                name === person
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-ink/15 bg-surface text-ink'
              }`}
            >
              {person}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-2">
        <span className="h-label">{t('staff.signIn.pin')}</span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          pattern="[0-9]*"
          maxLength={20}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          className="min-h-tap w-full rounded-xl border border-ink/20 bg-surface px-4 py-3 text-center text-2xl tracking-[0.5em]"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger-500">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary w-full" disabled={!name || !pin || busy}>
        {t('staff.signIn.submit')}
      </button>
    </form>
  );
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useCustomer } from '../../../components/customer/CustomerProvider';
import { SignIn } from '../../../components/staff/SignIn';
import { StaffShell } from '../../../components/staff/StaffShell';
import {
  StaffApiError,
  staffFetch,
  useStaffSession,
  type TableOverview,
} from '../../../components/staff/useStaff';
import type { MessageKey } from '../../../i18n';

/**
 * The tables themselves: add one, set where it stands, take it out of service
 * or bring it back. A table is never deleted, so its history stays and its
 * printed card works again if it comes back.
 */
export default function StaffTablesPage() {
  const { session, reload } = useStaffSession();
  if (!session) return <StaffShell name={null}>{null}</StaffShell>;
  if (!session.name) {
    return (
      <StaffShell name={null}>
        <SignIn session={session} onSignedIn={reload} />
      </StaffShell>
    );
  }
  return (
    <StaffShell name={session.name}>
      <Tables />
    </StaffShell>
  );
}

type Area = 'INSIDE' | 'OUTSIDE' | null;

function Tables() {
  const { t } = useCustomer();
  const [tables, setTables] = useState<TableOverview[] | null>(null);
  const [number, setNumber] = useState('');
  const [area, setArea] = useState<Area>('INSIDE');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setTables((await staffFetch<{ tables: TableOverview[] }>('/api/staff/tables')).tables);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (call: () => Promise<{ tables: TableOverview[] }>) => {
    setError(null);
    try {
      setTables((await call()).tables);
      return true;
    } catch (err) {
      const code = err instanceof StaffApiError ? err.code : '';
      const key = `staff.error.${code}` as MessageKey;
      setError(t(key) === key ? t('common.error') : t(key));
      return false;
    }
  };

  const patch = (tableNumber: string, body: { area?: Area; isActive?: boolean }) =>
    run(() =>
      staffFetch(`/api/staff/tables/${encodeURIComponent(tableNumber)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    );

  const areaLabel = (value: Area) => t(`staff.tables.area.${value ?? 'none'}` as MessageKey);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Link href="/staff" className="min-h-tap py-2 text-sm font-semibold text-brand-700">
          ‹ {t('staff.table.back')}
        </Link>
        <h1 className="h-section">{t('staff.tables.title')}</h1>
      </div>

      <form
        className="card space-y-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(() =>
            staffFetch('/api/staff/tables', {
              method: 'POST',
              body: JSON.stringify({ tableNumber: number.trim(), area }),
            }),
          );
          if (ok) setNumber('');
        }}
      >
        <h2 className="h-label">{t('staff.tables.add')}</h2>
        <div className="flex gap-2">
          <input
            aria-label={t('staff.tables.number')}
            placeholder={t('staff.tables.number')}
            value={number}
            maxLength={8}
            onChange={(e) => setNumber(e.target.value)}
            className="min-h-tap w-28 rounded-xl border border-ink/20 bg-surface px-3"
          />
          <AreaSelect value={area} onChange={setArea} label={areaLabel} />
          <button type="submit" className="btn-primary flex-1" disabled={!number.trim()}>
            +
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="text-sm font-semibold text-danger-500">
          {error}
        </p>
      )}

      {!tables ? (
        <p className="text-sm text-ink-muted">{t('common.loading')}</p>
      ) : (
        <>
          <ul className="card divide-y divide-ink/10">
            {tables
              .filter((x) => x.isActive)
              .map((table) => (
                <li key={table.tableNumber} className="flex items-center gap-3 p-3">
                  <span className="w-14 font-display text-xl font-bold">{table.tableNumber}</span>
                  <AreaSelect
                    value={table.area}
                    onChange={(value) => patch(table.tableNumber, { area: value })}
                    label={areaLabel}
                  />
                  <button
                    type="button"
                    className="ml-auto min-h-tap px-2 text-sm text-danger-500"
                    onClick={() => {
                      if (window.confirm(t('staff.tables.remove.confirm', { table: table.tableNumber }))) {
                        void patch(table.tableNumber, { isActive: false });
                      }
                    }}
                  >
                    {t('staff.tables.remove')}
                  </button>
                </li>
              ))}
          </ul>

          {tables.some((x) => !x.isActive) && (
            <section className="space-y-2">
              <h2 className="h-label">{t('staff.tables.removed')}</h2>
              <ul className="card divide-y divide-ink/10">
                {tables
                  .filter((x) => !x.isActive)
                  .map((table) => (
                    <li key={table.tableNumber} className="flex items-center gap-3 p-3 text-ink-muted">
                      <span className="w-14 font-display text-xl font-bold">{table.tableNumber}</span>
                      <button
                        type="button"
                        className="ml-auto min-h-tap px-2 text-sm font-semibold text-brand-700"
                        onClick={() => patch(table.tableNumber, { isActive: true })}
                      >
                        {t('staff.tables.restore')}
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}

function AreaSelect({
  value,
  onChange,
  label,
}: {
  value: Area;
  onChange: (value: Area) => void;
  label: (value: Area) => string;
}) {
  const { t } = useCustomer();
  return (
    <select
      aria-label={t('staff.tables.area')}
      value={value ?? ''}
      onChange={(e) => onChange((e.target.value || null) as Area)}
      className="min-h-tap rounded-xl border border-ink/20 bg-surface px-2 text-sm"
    >
      <option value="">{label(null)}</option>
      <option value="INSIDE">{label('INSIDE')}</option>
      <option value="OUTSIDE">{label('OUTSIDE')}</option>
    </select>
  );
}

'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { useCustomer } from '../../../../components/customer/CustomerProvider';
import { useMenu, type MenuItem } from '../../../../components/customer/useMenu';
import { SignIn } from '../../../../components/staff/SignIn';
import { StaffShell } from '../../../../components/staff/StaffShell';
import {
  staffFetch,
  usePolling,
  useStaffSession,
  type TableCart,
} from '../../../../components/staff/useStaff';
import { formatMoney } from '../../../../lib/format';

/**
 * One table, for the member of staff at it: what the guests have put in the
 * shared cart, changed line by line; dishes added for a guest ordering from
 * the printed menu; and, once the table has paid, clearing it for the next
 * guests. Read again every few seconds, so what a guest adds meanwhile shows.
 */
export default function StaffTablePage() {
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
      <Table />
    </StaffShell>
  );
}

type Change = { menuItemId: string; delta: number } | { menuItemId: string; quantity: number };

function Table() {
  const { t, locale } = useCustomer();
  const router = useRouter();
  const tableNumber = decodeURIComponent(String(useParams<{ number: string }>().number));
  const path = `/api/staff/tables/${encodeURIComponent(tableNumber)}`;
  const [cart, setCart] = useState<TableCart | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    try {
      setCart(await staffFetch<TableCart>(`${path}/cart?lang=${locale}`));
    } catch {
      setMissing(true);
    }
  }, [path, locale]);
  usePolling(load);

  const change = async (body: Change) => {
    setCart(await staffFetch<TableCart>(`${path}/cart?lang=${locale}`, { method: 'POST', body: JSON.stringify(body) }));
  };

  if (missing) {
    return (
      <Link href="/staff" className="btn-secondary w-full">
        ‹ {t('staff.table.back')}
      </Link>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <Link href="/staff" className="min-h-tap py-2 text-sm font-semibold text-brand-700">
          ‹ {t('staff.table.back')}
        </Link>
        <h1 className="font-display text-3xl font-bold">{t('staff.table.title', { table: tableNumber })}</h1>
      </div>

      {!cart ? (
        <p className="text-sm text-ink-muted">{t('common.loading')}</p>
      ) : cart.lines.length === 0 ? (
        <p className="card p-4 text-sm text-ink-muted">{t('staff.table.empty')}</p>
      ) : (
        <>
          <ul className="card divide-y divide-ink/10">
            {cart.lines.map((line) => (
              <li key={line.menuItemId} className="p-3">
                <div className="flex items-start gap-3">
                  <span className="min-w-[3.25rem] shrink-0 font-display text-xl font-bold text-brand-600">
                    {line.dishNumber ?? '·'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug">
                      {line.name}
                      {line.volume && <span className="text-ink-muted"> · {line.volume}</span>}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {formatMoney(line.unitPriceCents)} ·{' '}
                      {t('staff.table.by', {
                        who: line.changedBy === 'guest' ? t('staff.table.guest') : line.changedBy,
                      })}
                      {!line.isAvailable && (
                        <span className="ml-1 font-semibold text-danger-500">· {t('staff.table.soldOut')}</span>
                      )}
                    </p>
                  </div>
                  <span className="font-semibold">{formatMoney(line.unitPriceCents * line.quantity)}</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    aria-label={`− ${line.name}`}
                    className="btn-secondary min-w-tap px-3"
                    onClick={() => change({ menuItemId: line.menuItemId, delta: -1 })}
                  >
                    −
                  </button>
                  <span className="min-w-8 text-center text-lg font-bold">{line.quantity}</span>
                  <button
                    type="button"
                    aria-label={`+ ${line.name}`}
                    className="btn-secondary min-w-tap px-3"
                    onClick={() => change({ menuItemId: line.menuItemId, delta: 1 })}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="ml-auto min-h-tap px-2 text-sm text-danger-500"
                    onClick={() => change({ menuItemId: line.menuItemId, quantity: 0 })}
                  >
                    {t('cart.remove')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between text-lg font-semibold">
            <span>{t('staff.table.total')}</span>
            <span>{formatMoney(cart.totalCents)}</span>
          </div>
        </>
      )}

      <AddDish onAdd={(menuItemId) => change({ menuItemId, delta: 1 })} />

      {cart && cart.lines.length > 0 && (
        <button
          type="button"
          className="min-h-tap w-full rounded-xl bg-danger-500 px-4 py-3 font-semibold text-white"
          onClick={async () => {
            if (!window.confirm(t('staff.table.clear.confirm', { table: tableNumber }))) return;
            await staffFetch(`${path}/clear`, { method: 'POST' });
            router.push('/staff');
          }}
        >
          {t('staff.table.clear', { table: tableNumber })}
        </button>
      )}
    </>
  );
}

function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Finds a dish by its number or name, for an order taken from the printed menu. */
function AddDish({ onAdd }: { onAdd: (menuItemId: string) => Promise<void> }) {
  const { t, locale } = useCustomer();
  const { categories } = useMenu(locale);
  const [query, setQuery] = useState('');
  const [added, setAdded] = useState<string | null>(null);

  const items = useMemo(() => (categories ?? []).flatMap((c) => c.items), [categories]);
  const found = useMemo(() => {
    const q = normalise(query.trim());
    if (!q) return [];
    return items
      .filter(
        (item: MenuItem) =>
          (item.dishNumber ?? '').startsWith(q) ||
          normalise(item.name).includes(q) ||
          normalise(item.nameVi).includes(q),
      )
      .slice(0, 25);
  }, [items, query]);

  return (
    <section className="space-y-2">
      <h2 className="h-label">{t('staff.table.add')}</h2>
      <input
        type="search"
        inputMode="search"
        placeholder={t('staff.table.search')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="min-h-tap w-full rounded-xl border border-ink/20 bg-surface px-4 py-3"
      />
      {found.length > 0 && (
        <ul className="card divide-y divide-ink/10">
          {found.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 p-3 text-left"
                onClick={async () => {
                  await onAdd(item.id);
                  setAdded(item.id);
                  window.setTimeout(() => setAdded(null), 1200);
                }}
              >
                <span className="min-w-[3.25rem] font-display font-bold text-brand-600">
                  {item.dishNumber ?? '·'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium leading-snug">
                    {item.name}
                    {item.volume && <span className="text-ink-muted"> · {item.volume}</span>}
                  </span>
                  <span className="block text-xs text-ink-muted">{formatMoney(item.priceCents)}</span>
                </span>
                <span className="min-w-tap rounded-xl bg-brand-50 px-3 py-2 text-center text-lg font-bold text-brand-700">
                  {added === item.id ? '✓' : '+'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

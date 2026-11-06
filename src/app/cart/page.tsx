'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCustomer } from '../../components/customer/CustomerProvider';
import { GuestJourney, PayPrompt } from '../../components/customer/GuestJourney';
import { formatMoney } from '../../lib/format';

/**
 * The guest's cart: what they would like, to show the waiter.
 *
 * Nothing here is sent to the kitchen. The waiter comes to the table, takes the
 * order from this list and keys it into the POS, so dish numbers are printed
 * large — they are what the waiter types.
 */
export default function CartPage() {
  const {
    t,
    cart,
    setQuantity,
    removeFromCart,
    moveToCourse,
    allAtOnce,
    setAllAtOnce,
    clearCart,
    cartTotalCents,
    sharedTable,
  } = useCustomer();
  const router = useRouter();

  if (cart.length === 0) {
    return (
      <div className="space-y-4">
        <GuestJourney current={1} t={t} />
        <h1 className="h-section">{t('cart.title')}</h1>
        <p className="card p-4 text-sm text-ink-muted">{t('cart.empty')}</p>
        <Link href="/menu" className="btn-primary w-full">
          {t('cart.browse')}
        </Link>
        <PayPrompt t={t} />
      </div>
    );
  }

  // A table's shared cart in courses: 1. Gang, 2. Gang, then drinks. All at
  // once, or a cart on this phone only: one list.
  const inCourses = Boolean(sharedTable) && !allAtOnce;
  const food = cart.filter((l) => l.kind !== 'DRINK');
  const drinks = cart.filter((l) => l.kind === 'DRINK');
  const groups: { key: string; title: string | null; lines: typeof cart }[] = !sharedTable
    ? [{ key: 'all', title: null, lines: cart }]
    : inCourses
      ? [
          { key: 'c1', title: t('course.1'), lines: food.filter((l) => (l.course ?? 1) === 1) },
          { key: 'c2', title: t('course.2'), lines: food.filter((l) => l.course === 2) },
          { key: 'drinks', title: t('course.drinks'), lines: drinks },
        ].filter((g) => g.lines.length > 0)
      : [
          { key: 'food', title: t('course.food'), lines: food },
          { key: 'drinks', title: t('course.drinks'), lines: drinks },
        ].filter((g) => g.lines.length > 0);

  return (
    <div className="space-y-4">
      <GuestJourney current={2} t={t} />
      <h1 className="h-section">{t('cart.title')}</h1>

      {/* Said before the list, so nobody waits for food they have not ordered. */}
      <div className="border-l-4 border-brand-600 bg-brand-50 p-3 text-sm text-ink">
        {sharedTable ? (
          <>
            <p className="font-semibold">{t('cart.shared.title', { table: sharedTable })}</p>
            <p className="mt-0.5">{t('cart.shared.body', { table: sharedTable })}</p>
          </>
        ) : (
          <>
            <p className="font-semibold">{t('cart.waiter.title')}</p>
            <p className="mt-0.5">{t('cart.waiter.body')}</p>
          </>
        )}
      </div>

      {/* A table's shared cart is served in courses (1. Gang, 2. Gang) or all at
          once: the table chooses, and the staff see it. */}
      {sharedTable && (
        <fieldset className="space-y-2">
          <legend className="h-label">{t('cart.serve.title')}</legend>
          <div className="flex gap-2">
            {([false, true] as const).map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={allAtOnce === value}
                onClick={() => setAllAtOnce(value)}
                className={`min-h-tap flex-1 rounded-xl border px-3 text-sm font-semibold ${
                  allAtOnce === value
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-ink/15 bg-surface text-ink'
                }`}
              >
                {value ? t('cart.serve.allAtOnce') : t('cart.serve.courses')}
              </button>
            ))}
          </div>
          <p className="text-sm text-ink-muted">
            {allAtOnce ? t('cart.serve.allHint') : t('cart.serve.coursesHint')}
          </p>
        </fieldset>
      )}

      {groups.map((group) => (
        <section key={group.key} className="space-y-2">
          {group.title && <h2 className="h-label">{group.title}</h2>}
          <ul className="card divide-y divide-ink/10">
            {group.lines.map((line) => (
              <li key={`${line.menuItemId}:${line.course ?? 1}`} className="p-3">
                <div className="flex items-start gap-3">
                  {line.dishNumber && (
                    <span className="min-w-[3.25rem] shrink-0 font-display text-xl font-bold text-brand-600">
                      {line.dishNumber}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug">{line.name}</p>
                    <p className="text-sm text-ink-muted">{formatMoney(line.unitPriceCents)}</p>
                  </div>
                  <p className="font-semibold">{formatMoney(line.unitPriceCents * line.quantity)}</p>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    aria-label={`− ${line.name}`}
                    className="btn-secondary min-w-tap px-3"
                    onClick={() => setQuantity(line.menuItemId, line.quantity - 1, line.course)}
                  >
                    −
                  </button>
                  <span className="min-w-8 text-center font-semibold" aria-live="polite">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label={`+ ${line.name}`}
                    className="btn-secondary min-w-tap px-3"
                    onClick={() => setQuantity(line.menuItemId, line.quantity + 1, line.course)}
                  >
                    +
                  </button>
                  {inCourses && line.kind !== 'DRINK' && (
                    <button
                      type="button"
                      className="min-h-tap rounded-xl border border-ink/15 px-3 text-sm font-semibold text-brand-700"
                      onClick={() =>
                        moveToCourse(line.menuItemId, line.course ?? 1, line.course === 2 ? 1 : 2)
                      }
                    >
                      {line.course === 2 ? t('course.toFirst') : t('course.toSecond')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="ml-auto min-h-tap px-2 text-sm text-danger-500"
                    onClick={() => removeFromCart(line.menuItemId, line.course)}
                  >
                    {t('cart.remove')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="flex items-center justify-between text-lg font-semibold">
        <span>{t('cart.total')}</span>
        <span>{formatMoney(cartTotalCents)}</span>
      </div>
      <p className="text-xs text-ink-muted">{t('menu.vatNote')}</p>

      {/* Back to whichever menu, classic or modern, the guest came from. */}
      <button
        type="button"
        className="btn-primary w-full"
        onClick={() => (window.history.length > 1 ? router.back() : router.push('/menu'))}
      >
        {t('cart.continue')}
      </button>
      <PayPrompt t={t} />

      {/* A table's shared cart is everyone's: the staff clear it after paying. */}
      {!sharedTable && (
        <button
          type="button"
          className="min-h-tap w-full text-sm text-ink-muted underline underline-offset-4"
          onClick={() => {
            if (window.confirm(t('cart.clear.confirm'))) clearCart();
          }}
        >
          {t('cart.clear')}
        </button>
      )}
    </div>
  );
}

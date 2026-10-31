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
  const { t, cart, setQuantity, removeFromCart, clearCart, cartTotalCents } = useCustomer();
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

  return (
    <div className="space-y-4">
      <GuestJourney current={2} t={t} />
      <h1 className="h-section">{t('cart.title')}</h1>

      {/* Said before the list, so nobody waits for food they have not ordered. */}
      <div className="border-l-4 border-brand-600 bg-brand-50 p-3 text-sm text-ink">
        <p className="font-semibold">{t('cart.waiter.title')}</p>
        <p className="mt-0.5">{t('cart.waiter.body')}</p>
      </div>

      <ul className="card divide-y divide-ink/10">
        {cart.map((line) => (
          <li key={line.menuItemId} className="p-3">
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

            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                aria-label={`− ${line.name}`}
                className="btn-secondary min-w-tap px-3"
                onClick={() => setQuantity(line.menuItemId, line.quantity - 1)}
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
                onClick={() => setQuantity(line.menuItemId, line.quantity + 1)}
              >
                +
              </button>
              <button
                type="button"
                className="ml-auto min-h-tap px-2 text-sm text-danger-500"
                onClick={() => removeFromCart(line.menuItemId)}
              >
                {t('cart.remove')}
              </button>
            </div>
          </li>
        ))}
      </ul>

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

      <button
        type="button"
        className="min-h-tap w-full text-sm text-ink-muted underline underline-offset-4"
        onClick={() => {
          if (window.confirm(t('cart.clear.confirm'))) clearCart();
        }}
      >
        {t('cart.clear')}
      </button>
    </div>
  );
}

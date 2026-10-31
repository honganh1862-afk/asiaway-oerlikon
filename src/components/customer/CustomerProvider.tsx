'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_LOCALE, type Locale, isLocale } from '../../i18n/locales';
import { createTranslator, type Translator } from '../../i18n';

/**
 * Guest-side state: chosen language and the cart.
 *
 * Both live in localStorage, so a reload, an accidental tab close or a phone
 * locking itself mid-meal does not lose what the guest has picked. The cart is
 * never sent anywhere: it is a list for the guest to show the waiter, who takes
 * the order at the table and keys it into the POS.
 */
export interface CartLine {
  readonly menuItemId: string;
  readonly name: string;
  readonly dishNumber: string | null;
  readonly unitPriceCents: number;
  readonly quantity: number;
}

interface CustomerState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translator;
  cart: CartLine[];
  addToCart: (line: Omit<CartLine, 'quantity'>, quantity?: number) => void;
  setQuantity: (menuItemId: string, quantity: number) => void;
  removeFromCart: (menuItemId: string) => void;
  clearCart: () => void;
  /** How many of one dish are in the cart, for the badge on its add button. */
  quantityOf: (menuItemId: string) => number;
  cartCount: number;
  cartTotalCents: number;
}

const Context = createContext<CustomerState | null>(null);

const LOCALE_KEY = 'aw.locale';
const CART_KEY = 'aw.cart';

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    // Private mode, blocked storage, or corrupt data: carry on without it.
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is a convenience here, never a requirement.
  }
}

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const storedLocale = read<string>(LOCALE_KEY, DEFAULT_LOCALE);
    if (isLocale(storedLocale)) {
      setLocaleState(storedLocale);
      document.documentElement.lang = storedLocale;
    }
    setCart(read<CartLine[]>(CART_KEY, []));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) write(CART_KEY, cart);
  }, [cart, hydrated]);

  // Keeps the pages, photos and menu a guest has seen on the phone, so a weak
  // signal at the table does not blank the menu (public/sw.js). Production
  // only: in development it would keep serving yesterday's code.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    write(LOCALE_KEY, next);
    document.documentElement.lang = next;
  }, []);

  const addToCart = useCallback((line: Omit<CartLine, 'quantity'>, quantity = 1) => {
    setCart((current) => {
      const existing = current.find((l) => l.menuItemId === line.menuItemId);
      if (existing) {
        return current.map((l) =>
          l.menuItemId === line.menuItemId
            ? { ...l, quantity: Math.min(99, l.quantity + quantity) }
            : l,
        );
      }
      return [...current, { ...line, quantity: Math.min(99, quantity) }];
    });
  }, []);

  const setQuantity = useCallback((menuItemId: string, quantity: number) => {
    setCart((current) =>
      quantity <= 0
        ? current.filter((l) => l.menuItemId !== menuItemId)
        : current.map((l) =>
            l.menuItemId === menuItemId ? { ...l, quantity: Math.min(99, quantity) } : l,
          ),
    );
  }, []);

  const removeFromCart = useCallback((menuItemId: string) => {
    setCart((current) => current.filter((l) => l.menuItemId !== menuItemId));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const quantityOf = useCallback(
    (menuItemId: string) => cart.find((l) => l.menuItemId === menuItemId)?.quantity ?? 0,
    [cart],
  );

  const value = useMemo<CustomerState>(
    () => ({
      locale,
      setLocale,
      t: createTranslator(locale),
      cart,
      addToCart,
      setQuantity,
      removeFromCart,
      clearCart,
      quantityOf,
      cartCount: cart.reduce((n, l) => n + l.quantity, 0),
      cartTotalCents: cart.reduce((n, l) => n + l.unitPriceCents * l.quantity, 0),
    }),
    [locale, setLocale, cart, addToCart, setQuantity, removeFromCart, clearCart, quantityOf],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCustomer(): CustomerState {
  const context = useContext(Context);
  if (!context) throw new Error('useCustomer must be used inside CustomerProvider');
  return context;
}

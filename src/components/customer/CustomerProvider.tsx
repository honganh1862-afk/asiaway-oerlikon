'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_LOCALE, type Locale, isLocale } from '../../i18n/locales';
import { createTranslator, type Translator } from '../../i18n';
import { hasStaffScreen } from '../../config/restaurant';
import { readTableCookie } from '../../domain/table';

/**
 * Guest-side state: chosen language and the cart.
 *
 * Where the restaurant has a staff screen (Winterthur) and the guest scanned a
 * table card, the cart is the table's: one list on the server that every phone
 * at the table reads and changes, and that the staff see on theirs. It is read
 * again every few seconds while the page is open, and a tap shows at once.
 *
 * Elsewhere the cart lives in localStorage, so a reload, an accidental tab
 * close or a phone locking itself mid-meal does not lose it, and it is a list
 * for the guest to show the waiter.
 *
 * Either way, nothing reaches the kitchen: the waiter takes the order at the
 * table and keys it into the POS.
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
  /** The table whose shared cart this is, or null for a cart on this phone only. */
  sharedTable: string | null;
}

const Context = createContext<CustomerState | null>(null);

const LOCALE_KEY = 'aw.locale';
const CART_KEY = 'aw.cart';
/** How often a phone looks for what others at the table have added. */
const SHARED_CART_POLL_MS = 4000;

interface ServerCart {
  lines: {
    menuItemId: string;
    name: string;
    dishNumber: string | null;
    unitPriceCents: number;
    quantity: number;
  }[];
}

function fromServer(cart: ServerCart): CartLine[] {
  return cart.lines.map((l) => ({
    menuItemId: l.menuItemId,
    name: l.name,
    dishNumber: l.dishNumber,
    unitPriceCents: l.unitPriceCents,
    quantity: l.quantity,
  }));
}

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

export function CustomerProvider({
  children,
  guestCart = true,
}: {
  children: ReactNode;
  /** False on the staff screens: a staff phone that once scanned a card is not a guest. */
  guestCart?: boolean;
}) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [sharedTable, setSharedTable] = useState<string | null>(null);

  useEffect(() => {
    const storedLocale = read<string>(LOCALE_KEY, DEFAULT_LOCALE);
    if (isLocale(storedLocale)) {
      setLocaleState(storedLocale);
      document.documentElement.lang = storedLocale;
    }
    const table = guestCart && hasStaffScreen() ? readTableCookie(document.cookie) : null;
    setSharedTable(table);
    if (!table && guestCart) setCart(read<CartLine[]>(CART_KEY, []));
    setHydrated(true);
  }, [guestCart]);

  // A cart on this phone only is kept on this phone.
  useEffect(() => {
    if (hydrated && !sharedTable && guestCart) write(CART_KEY, cart);
  }, [cart, hydrated, sharedTable, guestCart]);

  // --- the table's shared cart -------------------------------------------
  // A read that started before the latest change on this phone is stale by the
  // time it lands, and is dropped; so is any read while a change is in flight.
  const changes = useRef(0);
  const inFlight = useRef(0);

  const refresh = useCallback(async () => {
    if (!sharedTable) return;
    const seen = changes.current;
    try {
      const response = await fetch(`/api/table/${encodeURIComponent(sharedTable)}/cart?lang=${locale}`, {
        cache: 'no-store',
      });
      if (!response.ok) return;
      const data = (await response.json()) as ServerCart;
      if (seen === changes.current && inFlight.current === 0) setCart(fromServer(data));
    } catch {
      // Offline for a moment: keep showing the last list.
    }
  }, [sharedTable, locale]);

  const send = useCallback(
    async (change: { menuItemId: string; delta: number } | { menuItemId: string; quantity: number }) => {
      if (!sharedTable) return;
      changes.current += 1;
      inFlight.current += 1;
      try {
        const response = await fetch(
          `/api/table/${encodeURIComponent(sharedTable)}/cart?lang=${locale}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(change),
          },
        );
        inFlight.current -= 1;
        if (response.ok && inFlight.current === 0) setCart(fromServer((await response.json()) as ServerCart));
        else if (!response.ok) await refresh();
      } catch {
        inFlight.current -= 1;
        await refresh();
      }
    },
    [sharedTable, locale, refresh],
  );

  // Moves a cart started on this phone, before the card was scanned, onto the
  // table's list, once.
  useEffect(() => {
    if (!sharedTable) return;
    const local = read<CartLine[]>(CART_KEY, []);
    write(CART_KEY, []);
    void (async () => {
      for (const line of local) await send({ menuItemId: line.menuItemId, delta: line.quantity });
      await refresh();
    })();
    // Only when the table is first known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedTable]);

  useEffect(() => {
    if (!sharedTable) return;
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, SHARED_CART_POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sharedTable, refresh]);

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

  const addToCart = useCallback(
    (line: Omit<CartLine, 'quantity'>, quantity = 1) => {
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
      void send({ menuItemId: line.menuItemId, delta: quantity });
    },
    [send],
  );

  const setQuantity = useCallback(
    (menuItemId: string, quantity: number) => {
      setCart((current) =>
        quantity <= 0
          ? current.filter((l) => l.menuItemId !== menuItemId)
          : current.map((l) =>
              l.menuItemId === menuItemId ? { ...l, quantity: Math.min(99, quantity) } : l,
            ),
      );
      void send({ menuItemId, quantity: Math.max(0, Math.min(99, quantity)) });
    },
    [send],
  );

  const removeFromCart = useCallback(
    (menuItemId: string) => {
      setCart((current) => current.filter((l) => l.menuItemId !== menuItemId));
      void send({ menuItemId, quantity: 0 });
    },
    [send],
  );

  // A shared cart is the whole table's: one guest cannot empty it for everyone.
  // The staff clear it once the table has paid.
  const clearCart = useCallback(() => {
    if (!sharedTable) setCart([]);
  }, [sharedTable]);

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
      sharedTable,
    }),
    [locale, setLocale, cart, addToCart, setQuantity, removeFromCart, clearCart, quantityOf, sharedTable],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCustomer(): CustomerState {
  const context = useContext(Context);
  if (!context) throw new Error('useCustomer must be used inside CustomerProvider');
  return context;
}

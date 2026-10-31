import Link from 'next/link';

/**
 * The bare domain. Guests normally arrive through the QR code on their table,
 * which also tells the menu which table they are at; someone typing the
 * address can still read the menu from here.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/asiaway-logo.png" alt="Asiaway" className="h-10 w-auto" />
      <p className="text-ink-muted">
        Scan the QR code on your table, or open the menu here.
      </p>
      <Link href="/menu" className="btn-primary mt-2 w-full">
        See the menu
      </Link>
      <a href="/waiter" className="btn-secondary w-full">
        Staff sign in
      </a>
    </main>
  );
}

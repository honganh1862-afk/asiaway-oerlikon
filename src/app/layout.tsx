import type { Metadata, Viewport } from 'next';
import { Comfortaa, IBM_Plex_Sans, IBM_Plex_Sans_Thai } from 'next/font/google';
import { BASE_VIEWPORT } from '../config/viewport';
import './globals.css';

/* asiaway.ch serves both cuts from Typekit. The Google mirrors are the same
   designs and are self-hosted by next/font, so there is no third-party fetch
   on the guest's phone. */
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-plex-sans',
  display: 'swap',
});

const plexThai = IBM_Plex_Sans_Thai({
  subsets: ['latin', 'thai'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-plex-thai',
  display: 'swap',
});

/* The printed menu sets its section titles in a rounded lowercase face that
   echoes the logo; Comfortaa is the closest free cut, and covers Vietnamese. */
const book = Comfortaa({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '700'],
  variable: '--font-book',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Asiaway',
  description: 'The Asiaway menu, classic or modern.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = BASE_VIEWPORT;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexThai.variable} ${book.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}

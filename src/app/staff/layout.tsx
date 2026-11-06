import type { Metadata } from 'next';
import { CustomerProvider } from '../../components/customer/CustomerProvider';

export const metadata: Metadata = {
  title: 'Asiaway · Staff',
  // The staff screens are for the staff: kept out of search results.
  robots: { index: false, follow: false },
};

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  // CustomerProvider for the language and its translations; the staff screens
  // never touch a guest cart.
  return <CustomerProvider guestCart={false}>{children}</CustomerProvider>;
}

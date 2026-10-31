import { redirect } from 'next/navigation';

/**
 * The bare domain opens the menu. Guests normally arrive through the card on
 * their table, which also tells the menu which table they are at; someone
 * typing the address gets the same menu, just without a table.
 */
export default function HomePage() {
  redirect('/menu');
}

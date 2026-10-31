/**
 * The table a guest is sitting at, as their table card tells the menu.
 *
 * Nothing is ordered from the phone and no staff screen exists, so the table
 * is only a label: shown in the header, and given at the counter to find the
 * bill. It travels in a plain cookie the page can read, set by the link on the
 * card, and is never trusted for anything.
 */
export const TABLE_COOKIE = 'aw_table';

/** Long enough for one visit; a guest who comes back scans their new table. */
export const TABLE_COOKIE_MAX_AGE = 60 * 60 * 6;

const TABLE_NUMBER = /^[0-9A-Za-z-]{1,8}$/;

export function isTableNumber(value: string): boolean {
  return TABLE_NUMBER.test(value);
}

/** The link printed on a table's card. */
export function tableUrl(baseUrl: string, tableNumber: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/table/${encodeURIComponent(tableNumber)}`;
}

/** Reads the table from the browser's cookies, or null before any card is scanned. */
export function readTableCookie(cookie: string): string | null {
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== TABLE_COOKIE) continue;
    const value = decodeURIComponent(rest.join('='));
    return isTableNumber(value) ? value : null;
  }
  return null;
}

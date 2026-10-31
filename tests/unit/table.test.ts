import { describe, expect, it } from 'vitest';
import { isTableNumber, readTableCookie, tableUrl } from '../../src/domain/table';

describe('the table a card tells the menu', () => {
  it('prints the table number into the card link', () => {
    expect(tableUrl('https://asiaway-winterthur.vercel.app', '110')).toBe(
      'https://asiaway-winterthur.vercel.app/table/110',
    );
    expect(tableUrl('https://asiaway-oerlikon.vercel.app/', '4')).toBe(
      'https://asiaway-oerlikon.vercel.app/table/4',
    );
  });

  it('accepts table numbers and nothing that could inject into a page', () => {
    expect(isTableNumber('110')).toBe(true);
    expect(isTableNumber('4')).toBe(true);
    expect(isTableNumber('')).toBe(false);
    expect(isTableNumber('<script>')).toBe(false);
    expect(isTableNumber('123456789')).toBe(false);
  });

  it('reads the table back among other cookies, and ignores a forged one', () => {
    expect(readTableCookie('aw.x=1; aw_table=311; other=2')).toBe('311');
    expect(readTableCookie('other=2')).toBeNull();
    expect(readTableCookie('aw_table=%3Cb%3E')).toBeNull();
  });
});

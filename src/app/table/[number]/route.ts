import { NextResponse } from 'next/server';
import { TABLE_COOKIE, TABLE_COOKIE_MAX_AGE, isTableNumber } from '../../../domain/table';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The link on a table card: remembers which table the guest is at and opens
 * the menu. A number that is not one never stops anyone reading the menu; it
 * is just not remembered.
 */
export async function GET(request: Request, context: { params: Promise<{ number: string }> }) {
  const { number } = await context.params;
  const response = NextResponse.redirect(new URL('/menu', new URL(request.url).origin));

  if (isTableNumber(number)) {
    response.cookies.set(TABLE_COOKIE, number, {
      // Read by the page itself, to show the table.
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: TABLE_COOKIE_MAX_AGE,
    });
  }
  return response;
}

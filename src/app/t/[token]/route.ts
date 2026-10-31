import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../server/db/index';
import { restaurantTables } from '../../../server/db/schema';
import { isWellFormedQrToken } from '../../../domain/session/qr-token';
import { TABLE_COOKIE, TABLE_COOKIE_MAX_AGE } from '../../../domain/table';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The link on the first table cards, which carried a random code per table
 * rather than its number. Cards already glued to tables keep working: the code
 * is looked up, the table remembered as the new cards do, and the menu opened.
 *
 * A retired or unknown code is sent to a friendly page that reveals nothing
 * about which tables exist.
 */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const origin = new URL(request.url).origin;

  const [table] = isWellFormedQrToken(token)
    ? await (await db())
        .select({ tableNumber: restaurantTables.tableNumber })
        .from(restaurantTables)
        .where(and(eq(restaurantTables.qrToken, token), eq(restaurantTables.isActive, true)))
    : [];

  if (!table) return NextResponse.redirect(new URL('/qr-invalid', origin));

  const response = NextResponse.redirect(new URL('/menu', origin));
  response.cookies.set(TABLE_COOKIE, table.tableNumber, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TABLE_COOKIE_MAX_AGE,
  });
  return response;
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { RESTAURANT } from '../../../../config/restaurant';
import { db } from '../../../../server/db/index';
import { handleApiError } from '../../../../server/http/api';
import { NO_STORE, invalidBody, notServedHere } from '../../../../server/http/table-cart-api';
import {
  createStaffSession,
  requireStaff,
  signInStaff,
  staffCookie,
  staffSignInConfigured,
} from '../../../../server/staff/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ name: z.string().min(1).max(40), pin: z.string().min(1).max(20) });

/** Who is signed in, and the names to choose from on the sign-in screen. */
export async function GET(request: Request) {
  const off = notServedHere();
  if (off) return off;
  let name: string | null = null;
  try {
    name = requireStaff(request);
  } catch {
    name = null;
  }
  return NextResponse.json(
    { name, staff: RESTAURANT.staff, configured: staffSignInConfigured() },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const off = notServedHere();
  if (off) return off;
  try {
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) return invalidBody(body.error);
    const name = await signInStaff(await db(), request, body.data.name, body.data.pin);
    const response = NextResponse.json({ name }, { headers: NO_STORE });
    response.cookies.set(staffCookie(createStaffSession(name)));
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  const response = NextResponse.json({ name: null }, { headers: NO_STORE });
  response.cookies.set({ ...staffCookie(''), maxAge: 0 });
  return response;
}

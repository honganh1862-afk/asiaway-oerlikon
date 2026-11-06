import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { RESTAURANT } from '../../config/restaurant';
import { domainError } from '../../domain/errors';
import type { AppDatabase as Db } from '../db/client';
import { loginAttempts } from '../db/schema';

/**
 * Staff sign-in: a name from the restaurant's list and the shared PIN.
 *
 * The PIN is the deployment's STAFF_PIN setting, never in this repository
 * (which is public). A signed-in member of staff carries an httpOnly cookie
 * holding their name and an expiry, signed with the deployment's AUTH_SECRET,
 * so nothing is stored per session and a forged or edited cookie is refused.
 *
 * A four-digit PIN can be guessed by trying them all, so wrong PINs are
 * counted: ten from one connection, or thirty from everywhere, within fifteen
 * minutes, and sign-in pauses until the window has passed.
 */
export const STAFF_COOKIE = 'aw_staff';
export const STAFF_SESSION_SECONDS = 12 * 60 * 60;

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_IP = 10;
const MAX_FAILURES_OVERALL = 30;
/** The login_attempts table is keyed by an "email"; staff sign-ins share one. */
const ATTEMPT_KEY = 'staff-pin';

function secret(): string | null {
  return process.env.AUTH_SECRET || null;
}

/** Whether staff sign-in can work at all on this deployment. */
export function staffSignInConfigured(staff: readonly string[] = RESTAURANT.staff): boolean {
  return Boolean(secret() && process.env.STAFF_PIN && staff.length > 0);
}

function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

export function createStaffSession(name: string, now = Date.now()): string {
  const key = secret();
  if (!key) throw new Error('AUTH_SECRET is not set');
  const payload = Buffer.from(
    JSON.stringify({ n: name, e: Math.floor(now / 1000) + STAFF_SESSION_SECONDS }),
  ).toString('base64url');
  return `${payload}.${sign(payload, key)}`;
}

/** The signed-in member of staff, or null for a missing, forged or expired cookie. */
export function readStaffSession(
  value: string | undefined,
  now = Date.now(),
  staff: readonly string[] = RESTAURANT.staff,
): string | null {
  const key = secret();
  if (!key || !value) return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const { n, e } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      n: unknown;
      e: unknown;
    };
    if (typeof n !== 'string' || typeof e !== 'number') return null;
    if (e * 1000 <= now) return null;
    // Someone taken off the list loses access at once, whatever their cookie says.
    return staff.includes(n) ? n : null;
  } catch {
    return null;
  }
}

function cookieValue(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

/** The member of staff making this request; throws UNAUTHENTICATED otherwise. */
export function requireStaff(request: Request, staff: readonly string[] = RESTAURANT.staff): string {
  const name = readStaffSession(cookieValue(request, STAFF_COOKIE), Date.now(), staff);
  if (!name) throw domainError('UNAUTHENTICATED', 'Sign in as staff first');
  return name;
}

function pinMatches(pin: string): boolean {
  const expected = process.env.STAFF_PIN;
  if (!expected) return false;
  // Compared as digests, so the comparison takes the same time whatever the length.
  const a = createHash('sha256').update(pin).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function clientIpHash(request: Request): string {
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || 'unknown';
  return createHash('sha256').update(`${secret() ?? ''}:${ip}`).digest('hex');
}

/**
 * Checks a sign-in, counting a wrong PIN against the caller. Returns the name
 * signed in; throws RATE_LIMITED or UNAUTHENTICATED.
 */
export async function signInStaff(
  db: Db,
  request: Request,
  name: string,
  pin: string,
  staff: readonly string[] = RESTAURANT.staff,
): Promise<string> {
  if (!staffSignInConfigured(staff)) throw domainError('UNAUTHENTICATED', 'Staff sign-in is not set up');
  const ipHash = clientIpHash(request);
  const since = new Date(Date.now() - WINDOW_MS);

  const failures = async (fromThisIp: boolean) => {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.emailLower, ATTEMPT_KEY),
          eq(loginAttempts.succeeded, false),
          gt(loginAttempts.attemptedAt, since),
          ...(fromThisIp ? [eq(loginAttempts.ipHash, ipHash)] : []),
        ),
      );
    return Number(row?.n ?? 0);
  };
  if ((await failures(true)) >= MAX_FAILURES_PER_IP || (await failures(false)) >= MAX_FAILURES_OVERALL) {
    throw domainError('RATE_LIMITED', 'Too many wrong PINs; wait a few minutes');
  }

  const ok = staff.includes(name) && pinMatches(pin);
  await db.insert(loginAttempts).values({ emailLower: ATTEMPT_KEY, ipHash, succeeded: ok });
  if (!ok) throw domainError('UNAUTHENTICATED', 'Wrong name or PIN');
  return name;
}

export function staffCookie(value: string): {
  name: string;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: 'strict';
  path: string;
  maxAge: number;
} {
  return {
    name: STAFF_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Strict: no other site can make a signed-in phone change a table.
    sameSite: 'strict',
    path: '/',
    maxAge: STAFF_SESSION_SECONDS,
  };
}

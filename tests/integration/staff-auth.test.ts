import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestContext } from '../helpers/db';
import { loginAttempts } from '../../src/server/db/schema';
import {
  STAFF_COOKIE,
  STAFF_SESSION_SECONDS,
  createStaffSession,
  readStaffSession,
  requireStaff,
  signInStaff,
} from '../../src/server/staff/auth';
import type { AppDatabase } from '../../src/server/db/client';
import { RESTAURANT_PROFILES } from '../../src/config/restaurant';

// Winterthur's staff list.
const STAFF = RESTAURANT_PROFILES.winterthur.staff;

let ctx: TestContext;
let db: AppDatabase;
const env = { ...process.env };

beforeAll(async () => {
  ctx = await createTestDatabase();
  db = ctx.db as unknown as AppDatabase;
});
afterAll(async () => {
  process.env = env;
  await ctx.close();
});
beforeEach(async () => {
  process.env.AUTH_SECRET = 'test-secret-that-is-long-enough';
  process.env.STAFF_PIN = '0000';
  await db.delete(loginAttempts);
});

const request = (ip = '203.0.113.7', cookie?: string) =>
  new Request('https://example.test/api/staff/session', {
    headers: { 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}) },
  });

describe('staff sessions', () => {
  it('signs a name in and reads it back', () => {
    const value = createStaffSession('Edmond');
    expect(readStaffSession(value, Date.now(), STAFF)).toBe('Edmond');
    expect(requireStaff(request(undefined, `${STAFF_COOKIE}=${value}`), STAFF)).toBe('Edmond');
  });

  it('refuses an edited, forged or expired cookie', () => {
    const value = createStaffSession('Edmond');
    const [payload, signature] = value.split('.');
    const edited = Buffer.from(JSON.stringify({ n: 'Viet', e: 9_999_999_999 })).toString('base64url');
    expect(readStaffSession(`${edited}.${signature}`, Date.now(), STAFF)).toBeNull();
    expect(readStaffSession(`${payload}.not-the-signature`, Date.now(), STAFF)).toBeNull();
    expect(readStaffSession(value, Date.now() + (STAFF_SESSION_SECONDS + 1) * 1000, STAFF)).toBeNull();
    expect(readStaffSession(undefined)).toBeNull();
    expect(() => requireStaff(request(), STAFF)).toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED' }));
  });

  it('refuses a name not on the staff list, even signed', () => {
    expect(readStaffSession(createStaffSession('Mallory'), Date.now(), STAFF)).toBeNull();
  });

  it('stops working when the secret changes', () => {
    const value = createStaffSession('Edmond');
    process.env.AUTH_SECRET = 'another-secret-entirely';
    expect(readStaffSession(value, Date.now(), STAFF)).toBeNull();
  });
});

describe('signing in', () => {
  it('takes a listed name with the PIN, and nothing else', async () => {
    await expect(signInStaff(db, request(), 'Xuan', '0000', STAFF)).resolves.toBe('Xuan');
    await expect(signInStaff(db, request(), 'Xuan', '1234', STAFF)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(signInStaff(db, request(), 'Mallory', '0000', STAFF)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('pauses sign-in from a connection after ten wrong PINs', async () => {
    for (let i = 0; i < 10; i += 1) {
      await expect(signInStaff(db, request('198.51.100.1'), 'Yen', '9999', STAFF)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    }
    // Even the right PIN waits now…
    await expect(signInStaff(db, request('198.51.100.1'), 'Yen', '0000', STAFF)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    // …while a phone elsewhere still signs in.
    await expect(signInStaff(db, request('198.51.100.2'), 'Yen', '0000', STAFF)).resolves.toBe('Yen');
  });

  it('pauses everyone after thirty wrong PINs from anywhere', async () => {
    for (let i = 0; i < 30; i += 1) {
      await signInStaff(db, request(`192.0.2.${i}`), 'Tami', '9999', STAFF).catch(() => undefined);
    }
    await expect(signInStaff(db, request('192.0.2.200'), 'Tami', '0000', STAFF)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('is off until the deployment has a PIN', async () => {
    delete process.env.STAFF_PIN;
    await expect(signInStaff(db, request(), 'Trung', '', STAFF)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hasStaffScreen } from '../../config/restaurant';
import { apiError } from './api';

/** Shared by the guest and the staff cart routes. */
const Course = z.union([z.literal(1), z.literal(2)]);

export const CartChangeBody = z.union([
  z.object({ menuItemId: z.string().uuid(), delta: z.number().int().min(-99).max(99), course: Course.optional() }),
  z.object({ menuItemId: z.string().uuid(), quantity: z.number().int().min(0).max(99), course: Course.optional() }),
  z.object({ menuItemId: z.string().uuid(), from: Course, to: Course }),
  z.object({ allAtOnce: z.boolean() }),
]);

/** Live data: never kept by Vercel or the phone. */
export const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** Where the restaurant has no staff screen, these routes do not exist. */
export function notServedHere(): NextResponse | null {
  return hasStaffScreen() ? null : apiError('NOT_FOUND', 'Not available', undefined, 404);
}

export function invalidBody(error: z.ZodError): NextResponse {
  return apiError('VALIDATION_FAILED', 'Invalid request', { issues: error.issues.length });
}

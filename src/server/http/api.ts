import { NextResponse } from 'next/server';
import { DomainError } from '../../domain/errors';

/** Stable error codes; localised text is chosen by the client from the code. */
const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  RATE_LIMITED: 429,
};

export function apiError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
  status?: number,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status: status ?? STATUS_BY_CODE[code] ?? 400 },
  );
}

/**
 * Turns any thrown value into a safe response.
 *
 * Domain errors keep their code so the UI can react precisely. Anything else
 * becomes a generic 500: stack traces, SQL fragments and internal ids never
 * reach a caller.
 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof DomainError) {
    return apiError(error.code, error.message, error.details);
  }
  console.error('[api] unhandled error', error);
  return apiError('INTERNAL_ERROR', 'An unexpected error occurred', undefined, 500);
}

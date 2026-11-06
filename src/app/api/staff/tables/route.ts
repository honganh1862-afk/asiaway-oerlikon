import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '../../../../server/db/index';
import { handleApiError } from '../../../../server/http/api';
import { NO_STORE, invalidBody, notServedHere } from '../../../../server/http/table-cart-api';
import { requireStaff } from '../../../../server/staff/auth';
import { createTable, listTables } from '../../../../server/services/table-cart-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Every table and its open cart, for the staff overview. */
export async function GET(request: Request) {
  const off = notServedHere();
  if (off) return off;
  try {
    requireStaff(request);
    return NextResponse.json({ tables: await listTables(await db()) }, { headers: NO_STORE });
  } catch (error) {
    return handleApiError(error);
  }
}

const NewTable = z.object({
  tableNumber: z.string().trim().min(1).max(8),
  area: z.enum(['INSIDE', 'OUTSIDE']).nullable().optional(),
});

export async function POST(request: Request) {
  const off = notServedHere();
  if (off) return off;
  try {
    requireStaff(request);
    const body = NewTable.safeParse(await request.json().catch(() => null));
    if (!body.success) return invalidBody(body.error);
    const database = await db();
    await createTable(database, body.data);
    return NextResponse.json({ tables: await listTables(database) }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return handleApiError(error);
  }
}

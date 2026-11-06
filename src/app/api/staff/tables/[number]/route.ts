import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '../../../../../server/db/index';
import { handleApiError } from '../../../../../server/http/api';
import { NO_STORE, invalidBody, notServedHere } from '../../../../../server/http/table-cart-api';
import { requireStaff } from '../../../../../server/staff/auth';
import { listTables, updateTable } from '../../../../../server/services/table-cart-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Change = z.object({
  area: z.enum(['INSIDE', 'OUTSIDE']).nullable().optional(),
  isActive: z.boolean().optional(),
});

/** Changes a table's area, or takes it out of (or back into) service. */
export async function PATCH(request: Request, { params }: { params: Promise<{ number: string }> }) {
  const off = notServedHere();
  if (off) return off;
  try {
    requireStaff(request);
    const { number } = await params;
    const body = Change.safeParse(await request.json().catch(() => null));
    if (!body.success) return invalidBody(body.error);
    const database = await db();
    await updateTable(database, number, body.data);
    return NextResponse.json({ tables: await listTables(database) }, { headers: NO_STORE });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Takes a table out of service. It is kept, with its history, and can come back. */
export async function DELETE(request: Request, { params }: { params: Promise<{ number: string }> }) {
  const off = notServedHere();
  if (off) return off;
  try {
    requireStaff(request);
    const { number } = await params;
    const database = await db();
    await updateTable(database, number, { isActive: false });
    return NextResponse.json({ tables: await listTables(database) }, { headers: NO_STORE });
  } catch (error) {
    return handleApiError(error);
  }
}

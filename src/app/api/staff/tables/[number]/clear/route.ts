import { NextResponse } from 'next/server';
import { db } from '../../../../../../server/db/index';
import { handleApiError } from '../../../../../../server/http/api';
import { NO_STORE, notServedHere } from '../../../../../../server/http/table-cart-api';
import { requireStaff } from '../../../../../../server/staff/auth';
import { clearTable } from '../../../../../../server/services/table-cart-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** After paying: empties the table for its next guests. */
export async function POST(request: Request, { params }: { params: Promise<{ number: string }> }) {
  const off = notServedHere();
  if (off) return off;
  try {
    const staff = requireStaff(request);
    const { number } = await params;
    const cleared = await clearTable(await db(), number, staff);
    return NextResponse.json({ cleared }, { headers: NO_STORE });
  } catch (error) {
    return handleApiError(error);
  }
}

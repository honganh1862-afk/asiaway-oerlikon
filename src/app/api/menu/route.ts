import { NextResponse } from 'next/server';
import { db } from '../../../server/db/index';
import { getMenu } from '../../../server/services/menu-service';
import { parseLocale } from '../../../i18n/locales';
import { MENU_CACHE_HEADERS, handleApiError } from '../../../server/http/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The menu is public: a guest must be able to read it the moment they scan.
 * Cached as MENU_CACHE_HEADERS describes.
 */
export async function GET(request: Request) {
  try {
    const locale = parseLocale(new URL(request.url).searchParams.get('lang'));
    const categories = await getMenu(await db(), locale);
    return NextResponse.json({ locale, categories }, { headers: MENU_CACHE_HEADERS });
  } catch (error) {
    return handleApiError(error);
  }
}

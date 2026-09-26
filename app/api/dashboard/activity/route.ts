import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDashboardRevision } from '@/lib/journal/dashboard-revision';
import { getServerDashboardActivity } from '@/lib/trading/dashboard-server';
import {
  dashboardCacheHeaders,
  dashboardEtag,
  etagMatches,
} from '@/lib/trading/dashboard-http-cache';

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const accountId = request.nextUrl.searchParams.get('accountId')?.trim() ?? '';
    const tradingDay = request.nextUrl.searchParams.get('day')?.trim() ?? '';
    if (!accountId || !/^\d{8}$/.test(tradingDay)) {
      return NextResponse.json({ error: 'Invalid dashboard activity request.' }, { status: 400 });
    }

    const revision = await getDashboardRevision(session.user.id);
    const etag = dashboardEtag(session.user.id, `${accountId}:activity:${tradingDay}`, revision);
    const cacheHeaders = dashboardCacheHeaders(etag);
    if (etagMatches(request.headers.get('if-none-match'), etag)) {
      return new NextResponse(null, { status: 304, headers: cacheHeaders });
    }

    const transactions = await getServerDashboardActivity(
      session.user.id,
      accountId,
      tradingDay,
    );
    if (!transactions) {
      return NextResponse.json({ error: 'Trading account not found.' }, { status: 404 });
    }

    return NextResponse.json({ transactions }, { headers: cacheHeaders });
  } catch (error) {
    console.error('Dashboard activity failed:', error);
    return NextResponse.json({ error: 'Dashboard activity could not be loaded.' }, { status: 500 });
  }
}

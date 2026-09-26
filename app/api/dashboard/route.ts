import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDashboardRevision } from '@/lib/journal/dashboard-revision';
import { getCachedServerDashboardRange } from '@/lib/trading/dashboard-server';
import {
  dashboardCacheHeaders,
  dashboardEtag,
  etagMatches,
} from '@/lib/trading/dashboard-http-cache';
import type { DashboardRangeType } from '@/lib/trading/dashboard-range';

const RANGE_TYPES = new Set<DashboardRangeType>([
  '7d',
  '30d',
  'quarter',
  'lastquarter',
  'lastmonth',
  'mtd',
  'ytd',
  'custom',
  'month',
]);

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const accountId = request.nextUrl.searchParams.get('accountId')?.trim() ?? '';
    const requestedRange = request.nextUrl.searchParams.get('rangeType') as DashboardRangeType | null;
    if (!accountId || !requestedRange || !RANGE_TYPES.has(requestedRange)) {
      return NextResponse.json({ error: 'Invalid dashboard range request.' }, { status: 400 });
    }

    const rangeRequest = {
      rangeType: requestedRange,
      startDate: request.nextUrl.searchParams.get('startDate') ?? '',
      endDate: request.nextUrl.searchParams.get('endDate') ?? '',
    };
    const revision = await getDashboardRevision(session.user.id);
    const scope = `${accountId}:${rangeRequest.rangeType}:${rangeRequest.startDate}:${rangeRequest.endDate}`;
    const etag = dashboardEtag(session.user.id, scope, revision);
    const cacheHeaders = dashboardCacheHeaders(etag);
    if (etagMatches(request.headers.get('if-none-match'), etag)) {
      return new NextResponse(null, { status: 304, headers: cacheHeaders });
    }

    const dashboard = await getCachedServerDashboardRange(
      session.user.id,
      accountId,
      rangeRequest,
      revision,
    );
    if (!dashboard) {
      return NextResponse.json({ error: 'Trading account not found.' }, { status: 404 });
    }

    return NextResponse.json(dashboard, { headers: cacheHeaders });
  } catch (error) {
    console.error('Dashboard range failed:', error);
    return NextResponse.json({ error: 'Dashboard data could not be loaded.' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getServerDashboardRange } from '@/lib/trading/dashboard-server';
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

    const dashboard = await getServerDashboardRange(session.user.id, accountId, {
      rangeType: requestedRange,
      startDate: request.nextUrl.searchParams.get('startDate') ?? '',
      endDate: request.nextUrl.searchParams.get('endDate') ?? '',
    });
    if (!dashboard) {
      return NextResponse.json({ error: 'Trading account not found.' }, { status: 404 });
    }

    return NextResponse.json(dashboard);
  } catch (error) {
    console.error('Dashboard range failed:', error);
    return NextResponse.json({ error: 'Dashboard data could not be loaded.' }, { status: 500 });
  }
}

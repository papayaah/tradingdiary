import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getServerDashboardActivity } from '@/lib/trading/dashboard-server';

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

    const transactions = await getServerDashboardActivity(
      session.user.id,
      accountId,
      tradingDay,
    );
    if (!transactions) {
      return NextResponse.json({ error: 'Trading account not found.' }, { status: 404 });
    }

    return NextResponse.json({ transactions });
  } catch (error) {
    console.error('Dashboard activity failed:', error);
    return NextResponse.json({ error: 'Dashboard activity could not be loaded.' }, { status: 500 });
  }
}

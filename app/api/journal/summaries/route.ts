import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getServerJournalSummaries } from '@/lib/trading/dashboard-server';

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const accountId = request.nextUrl.searchParams.get('accountId')?.trim() ?? '';
    if (!accountId) {
      return NextResponse.json({ error: 'Missing account.' }, { status: 400 });
    }

    const summaries = await getServerJournalSummaries(session.user.id, accountId);
    if (!summaries) {
      return NextResponse.json({ error: 'Trading account not found.' }, { status: 404 });
    }

    return NextResponse.json({ summaries });
  } catch (error) {
    console.error('Journal summaries failed:', error);
    return NextResponse.json({ error: 'Journal summaries could not be loaded.' }, { status: 500 });
  }
}

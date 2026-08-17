import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { pullJournal, pushJournal } from '@/lib/journal/server-sync';
import type { JournalPushRequest } from '@/lib/journal/sync-types';

/** GET /api/journal/sync?since=<seq> — pull the journal (full snapshot at since=0). */
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }
    const sinceRaw = request.nextUrl.searchParams.get('since');
    const since = Number.isFinite(Number(sinceRaw)) ? Math.max(0, Math.floor(Number(sinceRaw))) : 0;
    const result = await pullJournal(session.user.id, since);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Journal pull failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

const emptyArrays: JournalPushRequest = {
  accounts: [], executions: [], cashFlows: [], dailyNotes: [], tradeNotes: [],
  tags: [], tradeTags: [], reviews: [], deletes: [],
};

/** POST /api/journal/sync — push local changes; returns conflicts + new cursor. */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }
    const body = (await request.json()) as Partial<JournalPushRequest>;
    const payload: JournalPushRequest = {
      accounts: Array.isArray(body.accounts) ? body.accounts : emptyArrays.accounts,
      executions: Array.isArray(body.executions) ? body.executions : emptyArrays.executions,
      cashFlows: Array.isArray(body.cashFlows) ? body.cashFlows : emptyArrays.cashFlows,
      dailyNotes: Array.isArray(body.dailyNotes) ? body.dailyNotes : emptyArrays.dailyNotes,
      tradeNotes: Array.isArray(body.tradeNotes) ? body.tradeNotes : emptyArrays.tradeNotes,
      tags: Array.isArray(body.tags) ? body.tags : emptyArrays.tags,
      tradeTags: Array.isArray(body.tradeTags) ? body.tradeTags : emptyArrays.tradeTags,
      reviews: Array.isArray(body.reviews) ? body.reviews : emptyArrays.reviews,
      deletes: Array.isArray(body.deletes) ? body.deletes : emptyArrays.deletes,
    };
    const result = await pushJournal(session.user.id, payload);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Journal push failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

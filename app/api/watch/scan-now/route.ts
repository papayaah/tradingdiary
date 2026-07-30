import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/server';
import { serverWatch } from '@/lib/db/server/schema';

// Force an immediate scan of the signed-in user's watches: mark them due now so
// the running scanner picks them up on its next scheduler tick (~5s) instead of
// waiting for the normal cadence. Rows then update live over SSE.
//
// Requires the scanner process to be running — always on in production, and
// `npm run scanner` locally. Without it, the watches are marked due but nothing
// processes them until the scanner runs.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const nowIso = new Date().toISOString();
  const rows = await db
    .update(serverWatch)
    .set({ nextScanAt: nowIso, updatedAt: nowIso })
    .where(and(eq(serverWatch.userId, session.user.id), eq(serverWatch.enabled, true)))
    .returning({ id: serverWatch.id });

  return NextResponse.json({ enqueued: rows.length });
}

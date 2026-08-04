import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/server';
import { serverWatch } from '@/lib/db/server/schema';
import { getScanQueue, evaluateJobId, type ScanJob } from '@/lib/scanner/queue';

// Manual "Scan Now": re-evaluate the signed-in user's watches against the data
// already in the shared cache and emit fresh state over SSE — WITHOUT triggering
// any provider request. It enqueues evaluate-only jobs (mode: 'evaluate') for the
// running scanner to process; it deliberately does NOT touch nextScanAt, so the
// provider acquisition cadence is untouched and repeated taps cost zero upstream
// calls. (Requires the scanner process to be running — always on in production.)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await db
    .select({ id: serverWatch.id })
    .from(serverWatch)
    .where(and(eq(serverWatch.userId, session.user.id), eq(serverWatch.enabled, true)));

  const queue = getScanQueue();
  const atSeconds = Math.floor(Date.now() / 1000);
  let enqueued = 0;
  for (const row of rows) {
    const job: ScanJob = { watchId: row.id, scheduledFor: atSeconds, mode: 'evaluate' };
    await queue.add('scan', job, {
      jobId: evaluateJobId(row.id, atSeconds),
      removeOnComplete: 1000,
      removeOnFail: 1000,
      attempts: 1, // cache-only read; nothing to retry
    });
    enqueued += 1;
  }

  return NextResponse.json({ enqueued });
}

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { db } from '@/lib/scanner/db';
import { serverWatch } from '@/lib/db/server/schema';
import { eq } from 'drizzle-orm';
import { evaluateJobId, getScanQueue, type ScanJob } from '@/lib/scanner/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action === 'trigger-scan-all') {
      const watches = await db
        .select({ id: serverWatch.id })
        .from(serverWatch)
        .where(eq(serverWatch.enabled, true));
      const atSeconds = Math.floor(Date.now() / 1000);
      const queue = getScanQueue();
      await Promise.all(watches.map((watch) => {
        const job: ScanJob = { watchId: watch.id, scheduledFor: atSeconds, mode: 'evaluate' };
        return queue.add('evaluate', job, {
          jobId: evaluateJobId(watch.id, atSeconds),
          removeOnComplete: 1000,
          removeOnFail: 5000,
          attempts: 1,
        });
      }));
      return NextResponse.json({
        success: true,
        message: `Queued ${watches.length} cache-only evaluations. Provider acquisition was not accelerated.`,
      });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Control action failed' },
      { status: 500 }
    );
  }
}

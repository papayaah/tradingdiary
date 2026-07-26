import { NextResponse } from 'next/server';
import { db } from '@/lib/scanner/db';
import { scannerHeartbeat } from '@/lib/db/server/schema';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { SCAN_QUEUE } from '@/lib/scanner/env';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // Admin-only: this exposes queue internals and worker state.
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let queueCounts = { active: 0, completed: 0, failed: 0, delayed: 0, waiting: 0 };
    let workers: Array<{ workerId: string; lastBeatAt: string }> = [];
    let redisConnected = false;

    try {
      const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

      const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
      await connection.connect().catch(() => {});

      if (connection.status === 'ready') {
        redisConnected = true;
        const queue = new Queue(SCAN_QUEUE, { connection });
        const c = await queue.getJobCounts('active', 'completed', 'failed', 'delayed', 'waiting');
        queueCounts = {
          active: c.active ?? 0,
          completed: c.completed ?? 0,
          failed: c.failed ?? 0,
          delayed: c.delayed ?? 0,
          waiting: c.waiting ?? 0,
        };
        await queue.close();
      }
      await connection.quit().catch(() => {});
    } catch {
      redisConnected = false;
    }

    try {
      const rows = await db.select().from(scannerHeartbeat);
      workers = rows.map((r) => ({
        workerId: r.workerId,
        lastBeatAt: r.lastBeatAt,
      }));
    } catch {
      workers = [];
    }

    return NextResponse.json({
      success: true,
      user: { id: session.user.id, email: session.user.email },
      redisConnected,
      queue: queueCounts,
      workers,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch queue metrics',
      },
      { status: 500 }
    );
  }
}

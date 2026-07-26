import { NextResponse } from 'next/server';
import { db } from '@/lib/scanner/db';
import { scannerHeartbeat } from '@/lib/db/server/schema';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const isAuth = !!session?.user;

    let queueCounts = { active: 0, completed: 0, failed: 0, delayed: 0, waiting: 0 };
    let workers: Array<{ workerId: string; lastBeatAt: string }> = [];
    let redisConnected = false;

    try {
      // Dynamic import for server runtime compatibility
      const { Queue } = require('bullmq');
      const IORedis = require('ioredis');
      const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

      const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
      await connection.connect().catch(() => {});

      if (connection.status === 'ready') {
        redisConnected = true;
        const queue = new Queue('scan-jobs', { connection });
        queueCounts = await queue.getJobCounts('active', 'completed', 'failed', 'delayed', 'waiting');
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
      authenticated: isAuth,
      user: session?.user ? { id: session.user.id, email: session.user.email } : null,
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

import { NextResponse } from 'next/server';
import { db } from '@/lib/scanner/db';
import { scannerHeartbeat, serverWatch, serverWatchState } from '@/lib/db/server/schema';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { SCAN_QUEUE, scannerConfig } from '@/lib/scanner/env';
import { isSessionActive, type WatchSession } from '@/lib/scanner/sessions';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { and, asc, desc, eq, inArray, ne, or } from 'drizzle-orm';

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
    let activeJobs: Array<{
      id: string;
      watchId: string;
      symbol?: string;
      interval?: string;
      assetClass?: string;
      mode?: string;
      processedOn?: number;
    }> = [];
    let workers: Array<{ workerId: string; lastBeatAt: string }> = [];
    let redisConnected = false;
    let redisMemory = {
      usedMemoryHuman: 'N/A',
      usedMemoryPeakHuman: 'N/A',
      maxmemoryHuman: 'N/A',
      utilizationPct: null as number | null,
    };

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

        const activeList = await queue.getActive(0, 20);
        if (activeList.length > 0) {
          const watchIds = activeList.map((j) => j.data?.watchId).filter(Boolean) as string[];
          const watches = watchIds.length > 0
            ? await db.select().from(serverWatch).where(inArray(serverWatch.id, watchIds)).catch(() => [])
            : [];
          const watchMap = new Map(watches.map((w) => [w.id, w]));

          activeJobs = activeList.map((job) => {
            const w = job.data?.watchId ? watchMap.get(job.data.watchId) : null;
            return {
              id: String(job.id),
              watchId: job.data?.watchId ?? 'unknown',
              symbol: w?.symbol,
              interval: w?.interval,
              assetClass: w?.assetClass,
              mode: job.data?.mode || 'scheduled',
              processedOn: job.processedOn,
            };
          });
        }

        try {
          const rawMem = await connection.info('memory');
          const memMap: Record<string, string> = {};
          for (const line of rawMem.split('\r\n')) {
            if (line && !line.startsWith('#')) {
              const [k, v] = line.split(':');
              if (k && v) memMap[k.trim()] = v.trim();
            }
          }
          const usedBytes = parseInt(memMap.used_memory || '0', 10);
          const maxBytes = parseInt(memMap.maxmemory || '0', 10);
          redisMemory = {
            usedMemoryHuman: memMap.used_memory_human || '0B',
            usedMemoryPeakHuman: memMap.used_memory_peak_human || '0B',
            maxmemoryHuman: maxBytes > 0 ? memMap.maxmemory_human || '0B' : 'Unlimited',
            utilizationPct: maxBytes > 0 ? Math.min(100, Math.round((usedBytes / maxBytes) * 100)) : null,
          };
        } catch {
          // Keep fallback redisMemory defaults
        }

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

    let recentScans: Array<{
      watchId: string;
      symbol: string;
      interval: string;
      assetClass: string;
      status: string;
      lastPrice: number | null;
      lastProvider: string | null;
      lastError: string | null;
      lastScannedAt: string | null;
    }> = [];

    try {
      const scans = await db
        .select({
          watchId: serverWatchState.watchId,
          symbol: serverWatch.symbol,
          interval: serverWatch.interval,
          assetClass: serverWatch.assetClass,
          status: serverWatchState.status,
          lastPrice: serverWatchState.lastPrice,
          lastProvider: serverWatchState.lastProvider,
          lastError: serverWatchState.lastError,
          lastScannedAt: serverWatchState.lastScannedAt,
        })
        .from(serverWatchState)
        .innerJoin(serverWatch, eq(serverWatchState.watchId, serverWatch.id))
        .orderBy(desc(serverWatchState.lastScannedAt))
        .limit(15);
      recentScans = scans;
    } catch {
      recentScans = [];
    }

    let upcomingScans: Array<{
      id: string;
      symbol: string;
      interval: string;
      assetClass: string;
      nextScanAt: string;
      scanFrequencySeconds: number;
    }> = [];

    try {
      // This panel represents work that can actually be enqueued now. The
      // durable schedule contains out-of-session equities too, but the scanner
      // only advances those rows without creating a job or provider request.
      const now = new Date();
      const activeEquitySessions = (['rth', 'pre', 'ext', 'all'] as const)
        .filter((watchSession) => isSessionActive(watchSession, 'equity', now));
      const eligibleNow = activeEquitySessions.length > 0
        ? or(
            ne(serverWatch.assetClass, 'equity'),
            inArray(serverWatch.session, activeEquitySessions as WatchSession[]),
          )
        : ne(serverWatch.assetClass, 'equity');

      const upcoming = await db
        .select({
          id: serverWatch.id,
          symbol: serverWatch.symbol,
          interval: serverWatch.interval,
          assetClass: serverWatch.assetClass,
          nextScanAt: serverWatch.nextScanAt,
          scanFrequencySeconds: serverWatch.scanFrequencySeconds,
        })
        .from(serverWatch)
        .where(and(eq(serverWatch.enabled, true), eligibleNow))
        .orderBy(asc(serverWatch.nextScanAt))
        .limit(10);
      upcomingScans = upcoming;
    } catch {
      upcomingScans = [];
    }

    return NextResponse.json({
      success: true,
      user: { id: session.user.id, email: session.user.email },
      redisConnected,
      redisMemory,
      queue: queueCounts,
      concurrency: {
        workerConcurrency: scannerConfig.concurrency,
        rateMax: scannerConfig.rateMax,
        rateDurationMs: scannerConfig.rateDurationMs,
      },
      activeJobs,
      upcomingScans,
      recentScans,
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

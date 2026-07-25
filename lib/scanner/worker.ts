// Scan worker: fetches candles, runs the shared detector, and commits watch
// state (+ a qualifying alert, unless in shadow mode) and a durable event row
// in one transaction, then emits a lightweight NOTIFY. Handlers are idempotent
// and alert inserts rely on the DB unique constraint for deduplication, so
// at-least-once redelivery is safe.

import { Worker, type Job } from 'bullmq';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/scanner/db';
import {
  serverWatch,
  serverWatchState,
  serverWatchAlert,
  scannerHeartbeat,
  watchEvent,
} from '@/lib/db/server/schema';
import { scanAllPatterns, PATTERN_VERSION } from '@/lib/scanner/patterns';
import { fetchCandles, boundRecent } from '@/lib/scanner/candles';
import { isSessionActive, type AssetClass, type WatchSession } from '@/lib/scanner/sessions';
import { SCAN_QUEUE, scannerConfig } from '@/lib/scanner/env';
import { createConnection, type ScanJob } from '@/lib/scanner/queue';

const REQUIRED_CANDLES = 3;

export interface ScanOutcome {
  status: 'idle' | 'normal' | 'bullish' | 'bearish' | 'no-data' | 'error';
  alerted: boolean;
  skipped?: string;
}

/** Core scan logic, exported for direct invocation in tests / one-shot runs. */
export async function processScanJob(job: ScanJob): Promise<ScanOutcome> {
  const [watch] = await db.select().from(serverWatch).where(eq(serverWatch.id, job.watchId));
  if (!watch || !watch.enabled) return { status: 'idle', alerted: false, skipped: 'missing-or-disabled' };

  // Revalidate session immediately before fetching (it may have closed since
  // enqueue). Out-of-session => no provider request; the scheduler already
  // advanced nextScanAt.
  if (!isSessionActive(watch.session as WatchSession, watch.assetClass as AssetClass)) {
    return { status: 'idle', alerted: false, skipped: 'out-of-session' };
  }

  const nowIso = new Date().toISOString();

  let candles;
  let providerName: string;
  try {
    const res = await fetchCandles(watch.symbol, watch.interval);
    candles = res.candles;
    providerName = res.provider;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fetch failed';
    await db
      .insert(serverWatchState)
      .values({
        watchId: watch.id,
        status: 'error',
        lastError: message,
        lastScannedAt: nowIso,
        recentCandles: [],
        updatedAt: nowIso,
      })
      .onConflictDoUpdate({
        target: serverWatchState.watchId,
        set: { status: 'error', lastError: message, lastScannedAt: nowIso, updatedAt: nowIso },
      });
    throw err; // let BullMQ retry with backoff
  }

  const last = candles[candles.length - 1];
  const hasData = candles.length >= REQUIRED_CANDLES && !!last;

  const matches = hasData ? scanAllPatterns(candles, watch.minMovePercent, REQUIRED_CANDLES) : [];
  const latest = matches.length ? matches[matches.length - 1] : null;
  const isCurrent = !!latest && !!last && latest.time === last.time;
  const matched = isCurrent ? latest.type : null;

  const status: ScanOutcome['status'] = !hasData ? 'no-data' : matched ?? 'normal';
  const willAlert = !!matched && !scannerConfig.shadow;

  await db.transaction(async (tx) => {
    await tx
      .insert(serverWatchState)
      .values({
        watchId: watch.id,
        status,
        lastPrice: last?.close,
        lastCandleTime: last ? new Date(last.time * 1000).toISOString() : null,
        lastScannedAt: nowIso,
        lastProvider: providerName,
        lastError: null,
        recentCandles: boundRecent(candles),
        updatedAt: nowIso,
      })
      .onConflictDoUpdate({
        target: serverWatchState.watchId,
        set: {
          status,
          lastPrice: last?.close,
          lastCandleTime: last ? new Date(last.time * 1000).toISOString() : null,
          lastScannedAt: nowIso,
          lastProvider: providerName,
          lastError: null,
          recentCandles: boundRecent(candles),
          updatedAt: nowIso,
        },
      });

    if (willAlert && latest && last) {
      // Dedup is enforced by the unique index; a repeat scan of the same candle
      // no-ops here. Non-qualifying scans insert no alert row at all.
      await tx
        .insert(serverWatchAlert)
        .values({
          userId: watch.userId,
          watchId: watch.id,
          symbol: watch.symbol,
          interval: watch.interval,
          direction: latest.type,
          candleTime: new Date(latest.time * 1000).toISOString(),
          price: last.close,
          changePercent: latest.change,
          message: latest.message,
          patternVersion: PATTERN_VERSION,
        })
        .onConflictDoNothing();
    }

    // Durable event + wakeup signal (consumed by the future SSE layer).
    const [evt] = await tx
      .insert(watchEvent)
      .values({
        userId: watch.userId,
        type: willAlert ? 'alert.created' : 'watch.state',
        payload: { watchId: watch.id, status },
      })
      .returning({ id: watchEvent.id });
    if (evt) {
      await tx.execute(sql`select pg_notify('watch_events', ${evt.id})`);
    }
  });

  return { status, alerted: willAlert };
}

export async function writeHeartbeat(status = 'ok', detail?: unknown): Promise<void> {
  const nowIso = new Date().toISOString();
  await db
    .insert(scannerHeartbeat)
    .values({ workerId: scannerConfig.workerId, status, lastBeatAt: nowIso, detail: detail ?? null })
    .onConflictDoUpdate({
      target: scannerHeartbeat.workerId,
      set: { status, lastBeatAt: nowIso, detail: detail ?? null },
    });
}

/** Create the BullMQ worker that consumes scan jobs. */
export function createScanWorker(): Worker<ScanJob> {
  return new Worker<ScanJob>(
    SCAN_QUEUE,
    async (job: Job<ScanJob>) => processScanJob(job.data),
    { connection: createConnection(), concurrency: scannerConfig.concurrency },
  );
}

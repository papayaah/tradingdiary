// Scan worker: fetches candles, runs the shared detector, and commits watch
// state (+ a qualifying alert, unless in shadow mode) and a durable event row
// in one transaction, then emits a lightweight NOTIFY. Handlers are idempotent
// and alert inserts rely on the DB unique constraint for deduplication, so
// at-least-once redelivery is safe.

import { Worker, type Job } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/scanner/db';
import {
  serverWatch,
  serverWatchState,
  serverWatchAlert,
  scannerHeartbeat,
  watchEvent,
} from '@/lib/db/server/schema';
import {
  DEFAULT_PATTERN_ID,
  isPatternId,
  scanAllPatterns,
  PATTERN_VERSION,
} from '@/lib/scanner/patterns';
import { boundRecent, filterCandlesForSession } from '@/lib/scanner/candles';
import { getSharedCandleService } from '@/lib/scanner/shared/shared-candle-service';
import { isSessionActive, type AssetClass, type WatchSession } from '@/lib/scanner/sessions';
import { SCAN_QUEUE, scannerConfig } from '@/lib/scanner/env';
import { createConnection, type ScanJob } from '@/lib/scanner/queue';
import { calculateEquityIntradayChange } from '@/lib/market/intraday-change';

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
    // Shared acquisition: equivalent watches (any user/device) needing the same
    // provider/symbol/interval/scope/bucket collapse to one upstream fetch. Only
    // the fetch is shared — evaluation, state, alerts, events, and push below
    // remain per-watch and unchanged.
    const res = await getSharedCandleService().getCandlesForWatch(
      watch.symbol,
      watch.interval,
      watch.assetClass as AssetClass,
    );
    candles = filterCandlesForSession(
      res.candles,
      watch.session as WatchSession,
      watch.assetClass as AssetClass,
    );
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
  const hasData = candles.length > 0 && !!last;
  const patternId = isPatternId(watch.patternId) ? watch.patternId : DEFAULT_PATTERN_ID;

  const matches = hasData
    ? scanAllPatterns(
        candles,
        watch.minMovePercent,
        watch.requiredCandleCount,
        patternId,
        watch.maxBodyOverlapPercent,
      )
    : [];
  const latest = matches.length ? matches[matches.length - 1] : null;
  const isCurrent = !!latest && !!last && latest.time === last.time;
  const matched = isCurrent ? latest.type : null;

  const status: ScanOutcome['status'] = !hasData ? 'no-data' : matched ?? 'normal';
  const willAlert = !!matched && !scannerConfig.shadow;
  const intradayChange = watch.assetClass === 'equity'
    ? calculateEquityIntradayChange(candles)
    : null;
  let createdAlertId: string | null = null;

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
      const [alertRow] = await tx
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
          intradayChange: intradayChange?.amount,
          intradayChangePercent: intradayChange?.percent,
          message: latest.message,
          patternId: latest.patternId,
          patternVersion: PATTERN_VERSION,
        })
        .onConflictDoNothing()
        .returning();

      if (alertRow) {
        createdAlertId = alertRow.id;
        // Send Web Push notification to all user devices (closed browser alerts)
        const { sendWebPushToUser } = await import('@/lib/scanner/push');
        void sendWebPushToUser(watch.userId, {
          symbol: watch.symbol,
          interval: watch.interval,
          matchedPattern: latest.type,
          message: latest.message,
          price: last.close,
          alertId: createdAlertId,
          createdAt: nowIso,
        });
      }
    }

    // Durable events + wakeup signal (consumed by the SSE layer). A watch.state
    // event is always emitted so the watchlist row reflects the latest scan; an
    // alerting scan additionally emits alert.created. Emitting both means an
    // alert no longer leaves the row's status/price/candles lagging a cycle (N1).
    const statePayload = {
      watchId: watch.id,
      symbol: watch.symbol,
      interval: watch.interval,
      patternId,
      maxBodyOverlapPercent: watch.maxBodyOverlapPercent,
      status,
      lastPrice: last?.close,
      lastCandleTime: last ? new Date(last.time * 1000).toISOString() : null,
      lastScannedAt: nowIso,
      lastProvider: providerName,
      lastError: null,
      recentCandles: boundRecent(candles),
    };

    const events: Array<{ type: string; payload: unknown }> = [];
    if (createdAlertId && latest) {
      events.push({
        type: 'alert.created',
        payload: {
          alertId: createdAlertId,
          watchId: watch.id,
          symbol: watch.symbol,
          interval: watch.interval,
          direction: latest.type,
          patternId: latest.patternId,
          matchedPattern: latest.message,
          minMovePercent: watch.minMovePercent,
          requiredCandleCount: watch.requiredCandleCount,
          maxBodyOverlapPercent: watch.maxBodyOverlapPercent,
          price: last?.close,
          intradayChange: intradayChange?.amount,
          intradayChangePercent: intradayChange?.percent,
          candles: boundRecent(candles),
          createdAt: nowIso,
        },
      });
    }
    // State last, so it carries the highest seq and settles the row after the alert.
    events.push({ type: 'watch.state', payload: statePayload });

    for (const e of events) {
      const [evt] = await tx
        .insert(watchEvent)
        .values({ userId: watch.userId, type: e.type, payload: e.payload })
        .returning({ id: watchEvent.id });
      if (evt) {
        await tx.execute(sql`select pg_notify('watch_events', ${evt.id})`);
      }
    }
  });

  return { status, alerted: createdAlertId !== null };
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
    {
      connection: createConnection(),
      concurrency: scannerConfig.concurrency,
      // First-pass provider throttle: cap jobs per window across the worker.
      limiter: { max: scannerConfig.rateMax, duration: scannerConfig.rateDurationMs },
    },
  );
}

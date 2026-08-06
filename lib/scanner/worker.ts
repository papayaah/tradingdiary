// Evaluation worker: reads provider-owned candle snapshots, runs the detector, and commits watch
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
  getPatternMinMovePercent,
  isPatternId,
  normalizePatternIds,
  normalizePatternSettings,
  scanAllPatterns,
  PATTERN_VERSION,
  type Candle,
} from '@/lib/scanner/patterns';
import { boundRecent, filterCandlesForSession, type CandleSnapshot } from '@/lib/scanner/candles';
import { getSharedCandleService } from '@/lib/scanner/shared/shared-candle-service';
import { isSessionActive, type AssetClass, type WatchSession } from '@/lib/scanner/sessions';
import { SCAN_QUEUE, scannerConfig } from '@/lib/scanner/env';
import { createConnection, type ScanJob } from '@/lib/scanner/queue';
import { calculateEquityIntradayChange, calculateFuturesDailyChange } from '@/lib/market/intraday-change';

// Prior futures settlement (= prior daily bar close) changes only once per
// trading day, so cache the daily bars per symbol per New York date. Fetching
// them on every scan would roughly double IBKR request volume and trip the
// gateway's pacing guard.
const futuresDailyCache = new Map<string, { day: string; candles: Array<{ time: number; close: number }> }>();

function newYorkDateKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function getFuturesDailyBars(symbol: string): Promise<Array<{ time: number; close: number }>> {
  const day = newYorkDateKey();
  const cached = futuresDailyCache.get(symbol);
  if (cached && cached.day === day) return cached.candles;
  const res = await getSharedCandleService().getCachedCandlesForWatch(symbol, '1d', 'futures');
  const candles = res?.candles ?? [];
  if (candles.length) futuresDailyCache.set(symbol, { day, candles });
  return candles;
}

export interface ScanOutcome {
  status: 'idle' | 'normal' | 'bullish' | 'bearish' | 'no-data' | 'error';
  alerted: boolean;
  skipped?: string;
}

/** Core scan logic, exported for direct invocation in tests / one-shot runs. */
export async function processScanJob(job: ScanJob): Promise<ScanOutcome> {
  const [watch] = await db.select().from(serverWatch).where(eq(serverWatch.id, job.watchId));
  if (!watch || !watch.enabled) return { status: 'idle', alerted: false, skipped: 'missing-or-disabled' };

  // Revalidate session immediately before evaluating (it may have closed since
  // enqueue). Out-of-session => no evaluation; the scheduler already
  // advanced nextScanAt.
  if (!isSessionActive(watch.session as WatchSession, watch.assetClass as AssetClass)) {
    return { status: 'idle', alerted: false, skipped: 'out-of-session' };
  }

  const nowIso = new Date().toISOString();
  let candles: Candle[];
  let providerName: string;
  // Every watch job is evaluation-only. The independent acquisition scheduler
  // owns all provider requests; scheduled scans and Scan Now only consume its
  // latest base snapshot (or the watch's persisted prior snapshot at startup).
  const cached = await getSharedCandleService().getCachedCandlesForWatch(
    watch.symbol,
    watch.interval,
    watch.assetClass as AssetClass,
  );
  if (cached && cached.candles.length > 0) {
    candles = filterCandlesForSession(
      cached.candles,
      watch.session as WatchSession,
      watch.assetClass as AssetClass,
    );
    providerName = cached.provider;
  } else {
    const [prev] = await db
      .select({
        recentCandles: serverWatchState.recentCandles,
        lastProvider: serverWatchState.lastProvider,
      })
      .from(serverWatchState)
      .where(eq(serverWatchState.watchId, watch.id));
    const prevCandles = Array.isArray(prev?.recentCandles)
      ? (prev!.recentCandles as CandleSnapshot[])
      : [];
    if (prevCandles.length === 0) {
      return { status: 'idle', alerted: false, skipped: 'no-cache' };
    }
    candles = prevCandles.map((c) => ({ ...c, volume: c.volume ?? 0 }));
    providerName = prev?.lastProvider ?? 'cache';
  }

  const last = candles[candles.length - 1];
  const hasData = candles.length > 0 && !!last;
  const patternId = isPatternId(watch.patternId) ? watch.patternId : DEFAULT_PATTERN_ID;
  const patternIds = normalizePatternIds(watch.patternIds, patternId);
  const normalizedSettings = normalizePatternSettings(watch.patternSettings, watch.minMovePercent);
  const latestMatches = hasData && last
    ? patternIds.flatMap((selectedPatternId) => {
        const matches = scanAllPatterns(
          candles,
          getPatternMinMovePercent(normalizedSettings, selectedPatternId, watch.minMovePercent),
          watch.requiredCandleCount,
          selectedPatternId,
          watch.maxBodyOverlapPercent,
          normalizedSettings,
        );
        const latest = matches.length ? matches[matches.length - 1] : null;
        return latest?.time === last.time ? [latest] : [];
      })
    : [];
  const matched = latestMatches[0]?.type ?? null;
  const matchedPatternIds = latestMatches.map((match) => match.patternId);

  const status: ScanOutcome['status'] = !hasData ? 'no-data' : matched ?? 'normal';
  const willAlert = !!matched && !scannerConfig.shadow;
  let intradayChange: { amount: number; percent: number } | null = null;
  if (watch.assetClass === 'equity') {
    intradayChange = calculateEquityIntradayChange(candles);
  } else if (watch.assetClass === 'futures' && last) {
    // Futures "change" is vs the prior session settlement (what IBKR shows), i.e.
    // the close of the prior daily bar — not an arbitrary point in the intraday
    // window. Fetch daily bars through the shared cache (deduped/cached) and
    // compare the current price to the prior settlement.
    try {
      const daily = await getFuturesDailyBars(watch.symbol);
      intradayChange = calculateFuturesDailyChange(daily, last.close);
    } catch {
      intradayChange = null;
    }
  }
  const createdAlerts: Array<{ id: string; match: (typeof latestMatches)[number] }> = [];

  await db.transaction(async (tx) => {
    await tx
      .insert(serverWatchState)
      .values({
        watchId: watch.id,
        status,
        matchedPatternIds,
        lastPrice: last?.close,
        lastCandleTime: last ? new Date(last.time * 1000).toISOString() : null,
        lastScannedAt: nowIso,
        lastProvider: providerName,
        lastError: null,
        recentCandles: boundRecent(candles),
        intradayChange: intradayChange?.amount ?? null,
        intradayChangePercent: intradayChange?.percent ?? null,
        updatedAt: nowIso,
      })
      .onConflictDoUpdate({
        target: serverWatchState.watchId,
        set: {
          status,
          matchedPatternIds,
          lastPrice: last?.close,
          lastCandleTime: last ? new Date(last.time * 1000).toISOString() : null,
          lastScannedAt: nowIso,
          lastProvider: providerName,
          lastError: null,
          recentCandles: boundRecent(candles),
          intradayChange: intradayChange?.amount ?? null,
          intradayChangePercent: intradayChange?.percent ?? null,
          updatedAt: nowIso,
        },
      });

    if (willAlert && last) {
      // Dedup is enforced by the unique index; a repeat scan of the same candle
      // no-ops here. Each qualifying detector creates its own alert.
      for (const latest of latestMatches) {
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
          createdAlerts.push({ id: alertRow.id, match: latest });
          // Send Web Push notification to all user devices (closed browser alerts)
          const { sendWebPushToUser } = await import('@/lib/scanner/push');
          void sendWebPushToUser(watch.userId, {
            symbol: watch.symbol,
            interval: watch.interval,
            matchedPattern: latest.type,
            message: latest.message,
            price: last.close,
            alertId: alertRow.id,
            createdAt: nowIso,
          });
        }
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
      patternIds,
      matchedPatternIds,
      maxBodyOverlapPercent: watch.maxBodyOverlapPercent,
      status,
      lastPrice: last?.close,
      lastCandleTime: last ? new Date(last.time * 1000).toISOString() : null,
      lastScannedAt: nowIso,
      lastProvider: providerName,
      lastError: null,
      recentCandles: boundRecent(candles),
      intradayChange: intradayChange?.amount ?? null,
      intradayChangePercent: intradayChange?.percent ?? null,
    };

    const events: Array<{ type: string; payload: unknown }> = [];
    for (const createdAlert of createdAlerts) {
      const latest = createdAlert.match;
      events.push({
        type: 'alert.created',
        payload: {
          alertId: createdAlert.id,
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

  return { status, alerted: createdAlerts.length > 0 };
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

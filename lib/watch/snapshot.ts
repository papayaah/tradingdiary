// Builds the one-shot watch snapshot the page loads before opening SSE:
// normalized watches, current state per watch, recent alerts, scanner health,
// and the monotonic event cursor to start the stream from.

import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/server';
import {
  serverWatch,
  serverWatchState,
  serverWatchAlert,
  scannerHeartbeat,
  watchEvent,
} from '@/lib/db/server/schema';
import { scannerTimestampToUtcIso } from '@/lib/watch/timestamps';
import { MAX_ALERT_HISTORY_ITEMS } from '@/lib/watch/alert-history';

const HEARTBEAT_STALE_MS = 60_000;

export interface WatchSnapshot {
  watches: unknown[];
  states: unknown[];
  alerts: unknown[];
  scanner: { online: boolean; workers: unknown[] };
  cursor: number;
}

export async function buildSnapshot(userId: string): Promise<WatchSnapshot> {
  const watches = await db.select().from(serverWatch).where(eq(serverWatch.userId, userId));

  // States for this user's watches (join keeps it to owned rows only).
  const states = await db
    .select({
      watchId: serverWatchState.watchId,
      status: serverWatchState.status,
      matchedPatternIds: serverWatchState.matchedPatternIds,
      lastPrice: serverWatchState.lastPrice,
      lastCandleTime: serverWatchState.lastCandleTime,
      lastScannedAt: serverWatchState.lastScannedAt,
      lastProvider: serverWatchState.lastProvider,
      lastError: serverWatchState.lastError,
      recentCandles: serverWatchState.recentCandles,
      intradayChange: serverWatchState.intradayChange,
      intradayChangePercent: serverWatchState.intradayChangePercent,
      updatedAt: serverWatchState.updatedAt,
    })
    .from(serverWatchState)
    .innerJoin(serverWatch, eq(serverWatchState.watchId, serverWatch.id))
    .where(eq(serverWatch.userId, userId));

  const alerts = await db
    .select()
    .from(serverWatchAlert)
    .where(eq(serverWatchAlert.userId, userId))
    .orderBy(desc(serverWatchAlert.createdAt))
    .limit(MAX_ALERT_HISTORY_ITEMS);

  const workers = await db.select().from(scannerHeartbeat);
  const now = Date.now();
  const online = workers.some(
    (worker) => {
      const lastBeatAt = scannerTimestampToUtcIso(worker.lastBeatAt);
      return worker.status === 'ok'
        && typeof lastBeatAt === 'string'
        && now - Date.parse(lastBeatAt) < HEARTBEAT_STALE_MS;
    },
  );

  const [{ cursor }] = await db
    .select({ cursor: sql<number>`coalesce(max(${watchEvent.seq}), 0)` })
    .from(watchEvent)
    .where(eq(watchEvent.userId, userId));

  const normalizedWatches = watches.map((watch) => ({
    ...watch,
    nextScanAt: scannerTimestampToUtcIso(watch.nextScanAt),
    createdAt: scannerTimestampToUtcIso(watch.createdAt),
    updatedAt: scannerTimestampToUtcIso(watch.updatedAt),
  }));
  const normalizedStates = states.map((state) => ({
    ...state,
    lastCandleTime: scannerTimestampToUtcIso(state.lastCandleTime),
    lastScannedAt: scannerTimestampToUtcIso(state.lastScannedAt),
    updatedAt: scannerTimestampToUtcIso(state.updatedAt),
  }));
  const normalizedAlerts = alerts.map((alert) => ({
    ...alert,
    candleTime: scannerTimestampToUtcIso(alert.candleTime),
    createdAt: scannerTimestampToUtcIso(alert.createdAt),
  }));
  const normalizedWorkers = workers.map((worker) => ({
    ...worker,
    lastBeatAt: scannerTimestampToUtcIso(worker.lastBeatAt),
  }));

  return {
    watches: normalizedWatches,
    states: normalizedStates,
    alerts: normalizedAlerts,
    scanner: { online, workers: normalizedWorkers },
    cursor: Number(cursor),
  };
}

/** True if this user has any events after the given cursor (cheap existence check). */
export async function hasEventsAfter(userId: string, cursor: number): Promise<boolean> {
  const rows = await db
    .select({ seq: watchEvent.seq })
    .from(watchEvent)
    .where(and(eq(watchEvent.userId, userId), gt(watchEvent.seq, cursor)))
    .limit(1);
  return rows.length > 0;
}

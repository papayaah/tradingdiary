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

const HEARTBEAT_STALE_MS = 60_000;
const RECENT_ALERTS_LIMIT = 50;

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
      lastPrice: serverWatchState.lastPrice,
      lastCandleTime: serverWatchState.lastCandleTime,
      lastScannedAt: serverWatchState.lastScannedAt,
      lastProvider: serverWatchState.lastProvider,
      lastError: serverWatchState.lastError,
      recentCandles: serverWatchState.recentCandles,
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
    .limit(RECENT_ALERTS_LIMIT);

  const workers = await db.select().from(scannerHeartbeat);
  const now = Date.now();
  const online = workers.some(
    (w) => w.status === 'ok' && now - Date.parse(w.lastBeatAt) < HEARTBEAT_STALE_MS,
  );

  const [{ cursor }] = await db
    .select({ cursor: sql<number>`coalesce(max(${watchEvent.seq}), 0)` })
    .from(watchEvent)
    .where(eq(watchEvent.userId, userId));

  return { watches, states, alerts, scanner: { online, workers }, cursor: Number(cursor) };
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

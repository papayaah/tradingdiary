// Scheduler: PostgreSQL is the source of scheduling truth. Each tick selects
// due, enabled watches, enqueues a deterministic one-shot BullMQ job for the
// eligible ones, and advances nextScanAt for all of them so nothing is scanned
// twice or silently dropped.

import { and, eq, lte } from 'drizzle-orm';
import { db } from '@/lib/scanner/db';
import { serverWatch } from '@/lib/db/server/schema';
import { getScanQueue, scanJobId, type ScanJob } from '@/lib/scanner/queue';
import { isSessionActive, type AssetClass, type WatchSession } from '@/lib/scanner/sessions';

function advance(fromIso: string, frequencySeconds: number): string {
  const base = Date.parse(fromIso);
  const now = Date.now();
  // Advance from whichever is later so a long-overdue watch doesn't stampede.
  return new Date(Math.max(base, now) + frequencySeconds * 1000).toISOString();
}

export interface TickResult {
  due: number;
  enqueued: number;
  deferred: number; // out-of-session, advanced without a provider request
}

/** Run one scheduling pass. Returns counts for observability. */
export async function scheduleDueWatches(now: Date = new Date()): Promise<TickResult> {
  const nowIso = now.toISOString();
  const dueWatches = await db
    .select()
    .from(serverWatch)
    .where(and(eq(serverWatch.enabled, true), lte(serverWatch.nextScanAt, nowIso)));

  const queue = getScanQueue();
  let enqueued = 0;
  let deferred = 0;

  for (const w of dueWatches) {
    const eligible = isSessionActive(
      w.session as WatchSession,
      w.assetClass as AssetClass,
      now,
    );

    if (eligible) {
      const scheduledFor = Math.floor(Date.parse(w.nextScanAt) / 1000);
      const jobId = scanJobId(w.id, scheduledFor);
      const job: ScanJob = { watchId: w.id, scheduledFor };
      await queue.add('scan', job, {
        jobId,
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });
      enqueued += 1;
    } else {
      deferred += 1; // no provider request; just re-evaluated next tick
    }

    // Advance the canonical schedule regardless of eligibility.
    await db
      .update(serverWatch)
      .set({ nextScanAt: advance(w.nextScanAt, w.scanFrequencySeconds), updatedAt: nowIso })
      .where(eq(serverWatch.id, w.id));
  }

  return { due: dueWatches.length, enqueued, deferred };
}

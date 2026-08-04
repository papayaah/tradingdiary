// BullMQ connection + queue wiring. A single Redis connection is shared for the
// queue; the worker creates its own (BullMQ requires a dedicated connection for
// blocking commands).

// @ts-ignore
import { Queue } from 'bullmq';
// @ts-ignore
import IORedis from 'ioredis';
import { SCAN_QUEUE, scannerConfig } from '@/lib/scanner/env';

/** Job payload is intentionally tiny: identifiers only, never candles/secrets. */
export interface ScanJob {
  watchId: string;
  scheduledFor: number; // epoch seconds of the scan window this job represents
  /**
   * 'scan' (default) may fetch upstream when the shared cache is cold; 'evaluate'
   * is a manual Scan Now — it re-runs the detector against already-cached data
   * only and never triggers a provider request, so repeated taps cost nothing.
   */
  mode?: 'scan' | 'evaluate';
}

export function createConnection(): IORedis {
  // maxRetriesPerRequest must be null for BullMQ blocking operations.
  return new IORedis(scannerConfig.redisUrl, { maxRetriesPerRequest: null });
}

let queue: Queue<ScanJob> | null = null;

export function getScanQueue(): Queue<ScanJob> {
  if (!queue) {
    queue = new Queue<ScanJob>(SCAN_QUEUE, { connection: createConnection() });
  }
  return queue;
}

/** Deterministic job id so redelivery/duplicate enqueues collapse to one job.
 *  BullMQ forbids ':' in custom job ids, so use '_' as the separator. */
export function scanJobId(watchId: string, scheduledFor: number): string {
  return `${watchId}_${scheduledFor}`;
}

/** Job id for a manual evaluate-only scan. Distinct namespace from scheduled
 *  scans so the two never dedupe against each other; taps within the same second
 *  collapse to one (harmless — same cached data). */
export function evaluateJobId(watchId: string, atSeconds: number): string {
  return `eval_${watchId}_${atSeconds}`;
}

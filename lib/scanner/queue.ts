// BullMQ connection + queue wiring. A single Redis connection is shared for the
// queue; the worker creates its own (BullMQ requires a dedicated connection for
// blocking commands).

import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { SCAN_QUEUE, scannerConfig } from '@/lib/scanner/env';

/** Job payload is intentionally tiny: identifiers only, never candles/secrets. */
export interface ScanJob {
  watchId: string;
  scheduledFor: number; // epoch seconds of the scan window this job represents
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

// Scanner entrypoint (the `scanner` service CMD). Starts the worker, ticks the
// scheduler on an interval, maintains a heartbeat, and shuts down gracefully.

import { scannerConfig } from '@/lib/scanner/env';
import { scheduleDueWatches } from '@/lib/scanner/scheduler';
import { createScanWorker, writeHeartbeat } from '@/lib/scanner/worker';

async function main() {
  console.log(
    `[scanner] starting worker=${scannerConfig.workerId} shadow=${scannerConfig.shadow} ` +
      `concurrency=${scannerConfig.concurrency} redis=${scannerConfig.redisUrl}`,
  );

  const worker = createScanWorker();
  worker.on('failed', (job, err) => console.error(`[scanner] job ${job?.id} failed:`, err?.message));
  worker.on('error', (err) => console.error('[scanner] worker error:', err.message));

  await writeHeartbeat('ok', { event: 'startup' });

  // Startup reconciliation: immediately enqueue any already-due watches rather
  // than waiting for the first interval. Because the scheduler reads due watches
  // from PostgreSQL every tick and enqueues with deterministic job ids, a Redis
  // flush self-heals here and on subsequent ticks without creating duplicates.
  try {
    const r = await scheduleDueWatches();
    console.log(`[scanner] startup reconcile due=${r.due} enqueued=${r.enqueued} deferred=${r.deferred}`);
  } catch (err) {
    console.error('[scanner] startup reconcile error:', err instanceof Error ? err.message : err);
  }

  const scheduleTimer = setInterval(async () => {
    try {
      const r = await scheduleDueWatches();
      if (r.enqueued || r.deferred) {
        console.log(`[scanner] tick due=${r.due} enqueued=${r.enqueued} deferred=${r.deferred}`);
      }
    } catch (err) {
      console.error('[scanner] scheduler tick error:', err instanceof Error ? err.message : err);
    }
  }, scannerConfig.schedulerTickMs);

  const heartbeatTimer = setInterval(() => {
    writeHeartbeat('ok').catch((err) => console.error('[scanner] heartbeat error:', err.message));
  }, 15000);

  const shutdown = async (signal: string) => {
    console.log(`[scanner] ${signal} received, shutting down...`);
    clearInterval(scheduleTimer);
    clearInterval(heartbeatTimer);
    await writeHeartbeat('offline', { event: 'shutdown' }).catch(() => {});
    await worker.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[scanner] fatal:', err);
  process.exit(1);
});

// Scanner entrypoint (the `scanner` service CMD). Starts the worker, ticks the
// scheduler on an interval, maintains a heartbeat, and shuts down gracefully.

// Must be first: loads .env.local before any module reads process.env at import.
import '@/lib/scanner/load-env';
import { scannerConfig } from '@/lib/scanner/env';
import { scheduleDueWatches } from '@/lib/scanner/scheduler';
import { createScanWorker, writeHeartbeat } from '@/lib/scanner/worker';
import { getSharedCandleService } from '@/lib/scanner/shared/shared-candle-service';
import { createGovernor, recomputeGovernor } from '@/lib/scanner/shared/governor-runtime';

async function main() {
  console.log(
    `[scanner] starting worker=${scannerConfig.workerId} shadow=${scannerConfig.shadow} ` +
      `concurrency=${scannerConfig.concurrency} redis=${scannerConfig.redisUrl}`,
  );

  // Surface push readiness at startup (push.ts is otherwise lazily imported on
  // the first alert, so a missing key would go unnoticed until then).
  const pushReady = !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;
  if (scannerConfig.shadow) {
    console.warn('[scanner] SHADOW MODE — no user-visible alerts or push will be sent (set SCANNER_SHADOW=false to enable)');
  }
  if (!pushReady) {
    console.error('[scanner] Web Push DISABLED — VAPID keys missing; closed-browser alerts will not be delivered');
  } else {
    console.log('[scanner] Web Push keys present');
  }

  const worker = createScanWorker();
  worker.on('failed', (job: any, err: any) => console.error(`[scanner] job ${job?.id} failed:`, err?.message));
  worker.on('error', (err: any) => console.error('[scanner] worker error:', err?.message));

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

  // Phase 6 adaptive cadence governor (opt-in). When enabled, periodically
  // recompute the effective per-scope acquisition cadence from the provider
  // budget + measured usage, and drive the shared cache's refresh rate from it.
  // Off by default: the acquisition layer uses the fixed bucket, unchanged.
  let governorTimer: NodeJS.Timeout | null = null;
  if (scannerConfig.governorEnabled) {
    const governor = createGovernor();
    getSharedCandleService().setCadenceProvider((scope) => governor.getCadenceSeconds(scope));
    const recompute = async () => {
      try {
        const decisions = await recomputeGovernor(governor);
        const changed = decisions.filter((d) => d.changed);
        if (changed.length) {
          console.log(
            '[scanner] governor ' +
              changed
                .map((d) => `${d.providerScope} N=${d.uniqueKeys} cadence=${d.cadenceSeconds}s`)
                .join(' '),
          );
        }
      } catch (err) {
        console.error('[scanner] governor recompute error:', err instanceof Error ? err.message : err);
      }
    };
    await recompute();
    governorTimer = setInterval(recompute, scannerConfig.governorRecomputeMs);
    console.log(
      `[scanner] cadence governor ENABLED (recompute every ${Math.round(scannerConfig.governorRecomputeMs / 1000)}s)`,
    );
  }

  const shutdown = async (signal: string) => {
    console.log(`[scanner] ${signal} received, shutting down...`);
    clearInterval(scheduleTimer);
    clearInterval(heartbeatTimer);
    if (governorTimer) clearInterval(governorTimer);
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

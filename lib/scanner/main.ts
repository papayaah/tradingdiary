// Scanner entrypoint (the `scanner` service CMD). Starts the worker, ticks the
// scheduler on an interval, maintains a heartbeat, and shuts down gracefully.

// Must be first: loads .env.local before any module reads process.env at import.
import '@/lib/scanner/load-env';
import { scannerConfig } from '@/lib/scanner/env';
import { scheduleDueWatches } from '@/lib/scanner/scheduler';
import { createScanWorker, writeHeartbeat, deleteHeartbeat } from '@/lib/scanner/worker';
import { getSharedCandleService } from '@/lib/scanner/shared/shared-candle-service';
import { createGovernor, recomputeGovernor } from '@/lib/scanner/shared/governor-runtime';
import { AcquisitionScheduler } from '@/lib/scanner/acquisition-scheduler';
import { pausedClassSet, readScannerControl, type ProviderSelection } from '@/lib/scanner/control';
import {
  setRuntimeEquitiesProvider,
  setRuntimeCryptoProvider,
  setRuntimeFuturesProvider,
} from '@/lib/chart/providers';
import { syncDueIbkrFlexConnections } from '@/lib/ibkr-flex/scheduler';

async function main() {
  const initialControl = await readScannerControl();
  const applyRuntimeProviders = (providers: ProviderSelection) => {
    setRuntimeEquitiesProvider(providers.equity);
    setRuntimeCryptoProvider(providers.crypto);
    setRuntimeFuturesProvider(providers.futures);
  };
  applyRuntimeProviders(initialControl.providers);

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

  let governorTimer: NodeJS.Timeout | null = null;
  const governor = scannerConfig.governorEnabled ? createGovernor() : null;
  const recomputeGovernorCadence = async () => {
    if (!governor) return;
    try {
      const decisions = await recomputeGovernor(governor);
      const changed = decisions.filter((decision) => decision.changed);
      if (changed.length) {
        console.log(
          '[scanner] governor ' +
            changed
              .map((decision) =>
                `${decision.providerScope} N=${decision.uniqueKeys} cadence=${decision.cadenceSeconds}s`,
              )
              .join(' '),
        );
      }
    } catch (err) {
      console.error('[scanner] governor recompute error:', err instanceof Error ? err.message : err);
    }
  };

  if (governor) {
    getSharedCandleService().setCadenceProvider((scope) => governor.getCadenceSeconds(scope));
    await recomputeGovernorCadence();
    governorTimer = setInterval(
      recomputeGovernorCadence,
      scannerConfig.governorRecomputeMs,
    );
    console.log(
      `[scanner] cadence governor ENABLED (recompute every ${Math.round(scannerConfig.governorRecomputeMs / 1000)}s)`,
    );
  }

  // Per-asset-class pause set, kept current by the control poll and consulted by
  // both the acquisition scheduler and the evaluation scheduler.
  let pausedClasses = pausedClassSet(initialControl);

  const acquisitionScheduler = new AcquisitionScheduler({
    cadenceForScope: (scope) => governor
      ? governor.getCadenceSeconds(scope)
      : Math.max(1, scannerConfig.acquisitionBucketMs / 1000),
  });
  acquisitionScheduler.setPausedClasses(pausedClasses);

  const worker = createScanWorker();
  worker.on('failed', (job, err) => {
    const data = job?.data;
    const symbol = data?.watchId || job?.id;
    console.error(`[scanner] job ${symbol} failed:`, err?.message);
  });
  worker.on('error', (err) => console.error('[scanner] worker error:', err.message));

  let scannerPaused = initialControl.paused;
  let providersKey = JSON.stringify(initialControl.providers);
  let pausedClassesKey = JSON.stringify(initialControl.pausedClasses);
  let cadenceOverridesKey = JSON.stringify(initialControl.cadenceOverrides);
  let controlCheckRunning = false;
  const syncGlobalControl = async () => {
    if (controlCheckRunning) return;
    controlCheckRunning = true;
    try {
      const control = await readScannerControl();
      let changed = false;
      if (control.paused !== scannerPaused) {
        changed = true;
        scannerPaused = control.paused;
        if (scannerPaused) {
          await worker.pause();
          console.warn('[scanner] GLOBALLY PAUSED — acquisitions, scheduling, and evaluations stopped');
        } else {
          worker.resume();
          console.log('[scanner] global pause cleared — scanner resumed');
        }
      }
      const nextProvidersKey = JSON.stringify(control.providers);
      if (nextProvidersKey !== providersKey) {
        changed = true;
        providersKey = nextProvidersKey;
        applyRuntimeProviders(control.providers);
        acquisitionScheduler.invalidateInventory();
        await recomputeGovernorCadence();
        console.log(`[scanner] providers changed to ${nextProvidersKey}`);
      }
      const nextPausedClassesKey = JSON.stringify(control.pausedClasses);
      if (nextPausedClassesKey !== pausedClassesKey) {
        changed = true;
        pausedClassesKey = nextPausedClassesKey;
        pausedClasses = pausedClassSet(control);
        acquisitionScheduler.setPausedClasses(pausedClasses);
        console.log(`[scanner] paused classes changed to ${nextPausedClassesKey}`);
      }
      const nextCadenceOverridesKey = JSON.stringify(control.cadenceOverrides);
      if (nextCadenceOverridesKey !== cadenceOverridesKey) {
        changed = true;
        cadenceOverridesKey = nextCadenceOverridesKey;
        // Recompute immediately so a manual cadence change applies within the 2s
        // control poll rather than waiting for the next 30s governor tick.
        await recomputeGovernorCadence();
        console.log(`[scanner] cadence overrides changed to ${nextCadenceOverridesKey}`);
      }
      if (!changed) return;
      await writeHeartbeat(scannerPaused ? 'paused' : 'ok', {
        event: 'global-control-change',
        providers: control.providers,
        pausedClasses: control.pausedClasses,
        changedAt: control.changedAt,
      });
    } catch (err) {
      console.error('[scanner] global control check failed:', err instanceof Error ? err.message : err);
    } finally {
      controlCheckRunning = false;
    }
  };

  if (scannerPaused) {
    await worker.pause();
    console.warn('[scanner] GLOBALLY PAUSED — persisted control restored at startup');
  }

  await writeHeartbeat(scannerPaused ? 'paused' : 'ok', {
    event: 'startup',
    providers: initialControl.providers,
    pausedClasses: initialControl.pausedClasses,
  });

  // Startup reconciliation: immediately enqueue any already-due watches rather
  // than waiting for the first interval. Because the scheduler reads due watches
  // from PostgreSQL every tick and enqueues with deterministic job ids, a Redis
  // flush self-heals here and on subsequent ticks without creating duplicates.
  if (!scannerPaused) {
    try {
      await acquisitionScheduler.tick();
      const r = await scheduleDueWatches(new Date(), pausedClasses);
      console.log(`[scanner] startup reconcile due=${r.due} enqueued=${r.enqueued} deferred=${r.deferred}`);
    } catch (err) {
      console.error('[scanner] startup reconcile error:', err instanceof Error ? err.message : err);
    }
  }

  let flexSyncRunning = false;
  const runFlexSync = async () => {
    if (flexSyncRunning) return;
    flexSyncRunning = true;
    try {
      const result = await syncDueIbkrFlexConnections();
      if (result.due > 0) {
        console.log(
          `[scanner] IBKR Flex due=${result.due} synced=${result.synced} failed=${result.failed}`,
        );
      }
    } catch (err) {
      console.error('[scanner] IBKR Flex scheduler error:', err instanceof Error ? err.message : err);
    } finally {
      flexSyncRunning = false;
    }
  };

  // Flex imports are account maintenance, not market scanning, so they continue
  // even when the live scanner is globally paused.
  await runFlexSync();
  const flexSyncTimer = setInterval(
    () => void runFlexSync(),
    Math.max(30_000, Number(process.env.IBKR_FLEX_SCHEDULER_TICK_MS ?? 60_000)),
  );

  const scheduleTimer = setInterval(async () => {
    if (scannerPaused) return;
    try {
      const r = await scheduleDueWatches(new Date(), pausedClasses);
      if (r.enqueued || r.deferred) {
        console.log(`[scanner] tick due=${r.due} enqueued=${r.enqueued} deferred=${r.deferred}`);
      }
    } catch (err) {
      console.error('[scanner] scheduler tick error:', err instanceof Error ? err.message : err);
    }
  }, scannerConfig.schedulerTickMs);

  const acquisitionTimer = setInterval(() => {
    if (scannerPaused) return;
    acquisitionScheduler.tick().catch((err) =>
      console.error('[scanner] acquisition tick error:', err instanceof Error ? err.message : err),
    );
  }, scannerConfig.acquisitionTickMs);

  const heartbeatTimer = setInterval(() => {
    writeHeartbeat(scannerPaused ? 'paused' : 'ok').catch((err) => console.error('[scanner] heartbeat error:', err.message));
  }, 15000);

  const controlTimer = setInterval(() => {
    void syncGlobalControl();
  }, 2000);

  const shutdown = async (signal: string) => {
    console.log(`[scanner] ${signal} received, shutting down...`);
    clearInterval(scheduleTimer);
    clearInterval(acquisitionTimer);
    clearInterval(heartbeatTimer);
    clearInterval(controlTimer);
    clearInterval(flexSyncTimer);
    if (governorTimer) clearInterval(governorTimer);
    // Remove the heartbeat row so a stopped worker leaves no ghost in the admin
    // "workers" list; an ungraceful exit is still covered by staleness detection.
    await deleteHeartbeat().catch(() => {});
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

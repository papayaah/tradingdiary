// Local shadow-mode proof: seed one watch, run a scheduler tick, let the worker
// process the job, then print the persisted state. Not shipped to production;
// invoked manually against throwaway local Redis + Postgres.
//
//   DATABASE_URL=... REDIS_URL=... SCANNER_SHADOW=true npx tsx lib/scanner/dev-run.ts SYMBOL

import { eq } from 'drizzle-orm';
import { db } from '@/lib/scanner/db';
import { user, serverWatch, serverWatchState } from '@/lib/db/server/schema';
import { scheduleDueWatches } from '@/lib/scanner/scheduler';
import { createScanWorker } from '@/lib/scanner/worker';
import { getScanQueue } from '@/lib/scanner/queue';

const SYMBOL = process.argv[2] || 'AAPL';
const INTERVAL = process.argv[3] || '5m';

async function main() {
  // Seed a user + one enabled, always-on watch that is already due.
  await db.insert(user).values({ id: 'dev-user', name: 'Dev', email: 'dev@example.com' }).onConflictDoNothing();

  const pastIso = new Date(Date.now() - 60_000).toISOString();
  const [watch] = await db
    .insert(serverWatch)
    .values({
      userId: 'dev-user',
      symbol: SYMBOL,
      assetClass: 'equity',
      interval: INTERVAL,
      minMovePercent: 0.1,
      session: 'all',
      enabled: true,
      scanFrequencySeconds: 60,
      nextScanAt: pastIso,
    })
    .onConflictDoUpdate({
      target: [serverWatch.userId, serverWatch.symbol, serverWatch.interval],
      set: { enabled: true, nextScanAt: pastIso, session: 'all' },
    })
    .returning();

  console.log(`[dev] seeded watch ${watch.id} ${watch.symbol} ${watch.interval}`);

  const worker = createScanWorker();
  const done = new Promise<void>((resolve, reject) => {
    worker.on('completed', (job) => {
      console.log(`[dev] job ${job.id} completed:`, job.returnvalue);
      resolve();
    });
    worker.on('failed', (job, err) => {
      console.error(`[dev] job ${job?.id} failed:`, err?.message);
      resolve(); // resolve anyway so we can inspect the error state row
    });
    setTimeout(() => reject(new Error('timed out waiting for job')), 30_000);
  });

  const tick = await scheduleDueWatches();
  console.log('[dev] scheduler tick:', tick);

  await done;

  const [state] = await db.select().from(serverWatchState).where(eq(serverWatchState.watchId, watch.id));
  console.log('[dev] persisted state:', {
    status: state?.status,
    lastPrice: state?.lastPrice,
    lastProvider: state?.lastProvider,
    lastCandleTime: state?.lastCandleTime,
    lastError: state?.lastError,
    recentCandles: Array.isArray(state?.recentCandles) ? state.recentCandles.length : state?.recentCandles,
  });

  await worker.close();
  await getScanQueue().close();
  process.exit(0);
}

main().catch((err) => {
  console.error('[dev] fatal:', err);
  process.exit(1);
});

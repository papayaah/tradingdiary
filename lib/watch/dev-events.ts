// Local proof for the snapshot builder + LISTEN bridge (below the HTTP/auth
// layer). Seeds data, checks buildSnapshot, catch-up, and live NOTIFY delivery.
//
//   DATABASE_URL=... npx tsx lib/watch/dev-events.ts

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/server';
import { user, serverWatch, serverWatchState, watchEvent } from '@/lib/db/server/schema';
import { buildSnapshot } from '@/lib/watch/snapshot';
import { subscribe, getEventsAfter, type WatchEventRow } from '@/lib/watch/events-bridge';

const UID = 'dev-user';

async function main() {
  await db.insert(user).values({ id: UID, name: 'Dev', email: 'dev@example.com' }).onConflictDoNothing();
  const [w] = await db
    .insert(serverWatch)
    .values({
      userId: UID, symbol: 'AAPL', assetClass: 'equity', interval: '5m',
      minMovePercent: 0.5, session: 'all', enabled: true, scanFrequencySeconds: 60,
      nextScanAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({ target: [serverWatch.userId, serverWatch.symbol, serverWatch.interval], set: { enabled: true } })
    .returning();

  await db
    .insert(serverWatchState)
    .values({ watchId: w.id, status: 'normal', lastPrice: 333.8, recentCandles: [], updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: serverWatchState.watchId, set: { status: 'normal', lastPrice: 333.8 } });

  await db.insert(watchEvent).values({ userId: UID, type: 'watch.state', payload: { watchId: w.id, status: 'normal' } });

  const snap = await buildSnapshot(UID);
  console.log('[dev] snapshot:', {
    watches: snap.watches.length, states: snap.states.length, alerts: snap.alerts.length,
    online: snap.scanner.online, cursor: snap.cursor,
  });

  const missed = await getEventsAfter(UID, 0);
  console.log('[dev] catch-up events after cursor 0:', missed.length);

  // Live delivery: subscribe, insert an event, NOTIFY, expect the push to fire.
  const got = new Promise<WatchEventRow>((resolve, reject) => {
    const unsub = subscribe(UID, (e) => { unsub(); resolve(e); });
    setTimeout(() => reject(new Error('no live event within 5s')), 5000);
  });
  // Small delay so LISTEN is established before we NOTIFY.
  await new Promise((r) => setTimeout(r, 500));
  const [evt] = await db
    .insert(watchEvent)
    .values({ userId: UID, type: 'alert.created', payload: { watchId: w.id, status: 'bullish' } })
    .returning({ id: watchEvent.id });
  await db.execute(sql`select pg_notify('watch_events', ${evt.id})`);

  const live = await got;
  console.log('[dev] live event received via LISTEN:', { type: live.type, seq: live.seq, payload: live.payload });

  console.log('[dev] OK');
  process.exit(0);
}

main().catch((err) => { console.error('[dev] fatal:', err); process.exit(1); });

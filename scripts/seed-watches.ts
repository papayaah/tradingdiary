// Seed the local database with the full symbol set (equities, futures, crypto)
// so a fresh local environment has watches to scan without logging in and
// syncing from production.
//
//   npm run db:seed        (after `npm run db:schema:push` has created the tables)
//
// Idempotent: re-running upserts the same rows. Reads the symbol list from
// scripts/seed/watchlist.json (dumped from production, regardless of user).
import '@/lib/scanner/load-env'; // must be first: load .env.local before db import
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/scanner/db';
import { user, userWatchlists, serverWatch } from '@/lib/db/server/schema';

// A fixed local dev user that owns every seeded watch. Logging in is not
// required for `npm run scanner` (the scanner reads server_watch directly).
const SEED_USER_ID = 'seed-user';
const SEED_USER_EMAIL = 'seed@local.dev';
// 'all' so nothing is session-gated locally (scan any time of day for testing).
const SEED_SESSION = 'all';
const SEED_PATTERN = 'consecutive';
const SEED_FREQUENCY_SECONDS = 600; // 10 minutes — safe default, not the 1-min fast test

interface SeedWatch {
  symbol: string;
  assetClass: 'equity' | 'futures' | 'crypto';
  interval: string;
  minMovePercent: number;
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const watches: SeedWatch[] = JSON.parse(
    readFileSync(join(here, 'seed', 'watchlist.json'), 'utf8'),
  );
  const nowIso = new Date().toISOString();

  // 1. Seed user (FK target for watches).
  await db
    .insert(user)
    .values({ id: SEED_USER_ID, name: 'Seed Dev', email: SEED_USER_EMAIL, emailVerified: true })
    .onConflictDoNothing();

  // 2. Settings blob (what the client would have synced). userWatchlists has no
  //    unique on user_id, so replace any existing row for this seed user.
  const blob = watches.map((w) => ({
    symbol: w.symbol,
    interval: w.interval,
    minMovePercent: w.minMovePercent,
  }));
  await db.delete(userWatchlists).where(eq(userWatchlists.userId, SEED_USER_ID));
  await db.insert(userWatchlists).values({
    userId: SEED_USER_ID,
    watchlist: blob,
    patternId: SEED_PATTERN,
    session: SEED_SESSION,
    scanFrequencySeconds: SEED_FREQUENCY_SECONDS,
    updatedAt: nowIso,
  });

  // 3. Normalized server_watch rows — the scanner's source of truth.
  for (const w of watches) {
    await db
      .insert(serverWatch)
      .values({
        userId: SEED_USER_ID,
        symbol: w.symbol,
        assetClass: w.assetClass,
        interval: w.interval,
        patternId: SEED_PATTERN,
        minMovePercent: w.minMovePercent,
        session: SEED_SESSION,
        enabled: true,
        scanFrequencySeconds: SEED_FREQUENCY_SECONDS,
        nextScanAt: nowIso,
        updatedAt: nowIso,
      })
      .onConflictDoUpdate({
        target: [serverWatch.userId, serverWatch.symbol, serverWatch.interval],
        set: {
          assetClass: w.assetClass,
          patternId: SEED_PATTERN,
          minMovePercent: w.minMovePercent,
          session: SEED_SESSION,
          enabled: true,
          scanFrequencySeconds: SEED_FREQUENCY_SECONDS,
          updatedAt: nowIso,
        },
      });
  }

  const byClass = watches.reduce<Record<string, number>>((acc, w) => {
    acc[w.assetClass] = (acc[w.assetClass] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`[seed] user=${SEED_USER_ID} watches=${watches.length}`, byClass);
  console.log('[seed] done. Run `npm run scanner` to scan them locally.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});

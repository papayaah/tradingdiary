import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { db } from '@/lib/db/server';
import { serverWatch, userWatchlists } from '@/lib/db/server/schema';
import {
  DEFAULT_PATTERN_ID,
  isPatternId,
  normalizePatternIds,
  normalizePatternSettings,
  type PatternId,
} from '@/lib/scanner/patterns';
import type { AssetClass, WatchSession } from '@/lib/scanner/sessions';
import {
  ADMIN_WATCHLIST_LIMIT,
  GUEST_WATCHLIST_LIMIT,
  canPersistAuthenticatedWatchlist,
  getWatchlistLimit,
} from '@/lib/watch/watchlist-limits';

const MIN_SCAN_FREQUENCY_SECONDS = 15;
const DEFAULT_SCAN_FREQUENCY_SECONDS = MIN_SCAN_FREQUENCY_SECONDS;
const VALID_SESSIONS = new Set<WatchSession>(['rth', 'pre', 'ext', 'all']);

const configuredAdminWatchlistLimit = (): number => {
  const configured = Number(process.env.ADMIN_WATCHLIST_LIMIT);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : ADMIN_WATCHLIST_LIMIT;
};

const accountWatchlistLimit = (email?: string | null): number =>
  getWatchlistLimit(
    true,
    isAdminEmail(email),
    configuredAdminWatchlistLimit(),
  );

interface SyncedWatch {
  symbol: string;
  interval: string;
}

const assetClassFor = (symbol: string): AssetClass => {
  if (symbol.endsWith('-USD')) return 'crypto';
  if (symbol.endsWith('=F')) return 'futures';
  return 'equity';
};

const cleanWatchlist = (rawWatchlist: unknown[]): SyncedWatch[] => {
  const unique = new Map<string, SyncedWatch>();
  for (const item of rawWatchlist) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Record<string, unknown>;
    const symbol = String(candidate.symbol ?? '').trim().toUpperCase();
    const interval = String(candidate.interval ?? '5m').trim();
    if (!symbol || !interval) continue;
    unique.set(`${symbol}\u0000${interval}`, { symbol, interval });
  }
  return [...unique.values()];
};

const parsePatternId = (value: unknown): PatternId =>
  isPatternId(value) ? value : DEFAULT_PATTERN_ID;

const parsePatternIds = (value: unknown, fallback: PatternId): PatternId[] =>
  normalizePatternIds(value, fallback);

const parseSession = (value: unknown): WatchSession =>
  typeof value === 'string' && VALID_SESSIONS.has(value as WatchSession)
    ? value as WatchSession
    // Default to 'all' (never silently mute). 'pre' was a footgun: it only scans
    // pre-market, so watches created without an explicit session went dark for
    // the whole regular trading day. Only applies when session is unset/invalid;
    // existing explicit choices are preserved.
    : 'all';

const parseScanFrequency = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_SCAN_FREQUENCY_SECONDS;
  }
  return Math.max(
    MIN_SCAN_FREQUENCY_SECONDS,
    Math.min(86_400, Math.round(value)),
  );
};

const parseMaxBodyOverlapPercent = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 100;
  return Math.max(0, Math.min(100, value));
};

const parseMinMovePercent = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.25;
  return Math.max(0.05, Math.min(3, value));
};

const parseRequiredCandleCount = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 3;
  return Math.max(2, Math.min(10, Math.round(value)));
};

// Asset classes the user has switched off. Watches in these classes are synced
// as enabled=false, so the scheduler and worker skip them entirely (no scans,
// no alerts, no push) while keeping the rows so they can be re-enabled later.
const parseDisabledAssetClasses = (value: unknown): Set<AssetClass> => {
  const disabled = new Set<AssetClass>();
  if (Array.isArray(value)) {
    for (const v of value) {
      if (v === 'equity' || v === 'futures' || v === 'crypto') disabled.add(v);
    }
  }
  return disabled;
};

// A category is "off" when it has at least one watch and every one is disabled.
// Derived from server_watch so the client's toggles reflect server truth.
async function computeDisabledAssetClasses(userId: string): Promise<AssetClass[]> {
  const rows = await db
    .select({ assetClass: serverWatch.assetClass, enabled: serverWatch.enabled })
    .from(serverWatch)
    .where(eq(serverWatch.userId, userId));
  const tally = new Map<string, { enabled: number; total: number }>();
  for (const r of rows) {
    const t = tally.get(r.assetClass) ?? { enabled: 0, total: 0 };
    t.total += 1;
    if (r.enabled) t.enabled += 1;
    tally.set(r.assetClass, t);
  }
  const disabled: AssetClass[] = [];
  for (const [cls, t] of tally) {
    if (t.total > 0 && t.enabled === 0) disabled.push(cls as AssetClass);
  }
  return disabled;
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({
        watchlist: null,
        authenticated: false,
        watchlistLimit: GUEST_WATCHLIST_LIMIT,
      }, { status: 200 });
    }
    const watchlistLimit = accountWatchlistLimit(session.user.email);

    const records = await db
      .select()
      .from(userWatchlists)
      .where(eq(userWatchlists.userId, session.user.id))
      .limit(1);

    // Derive the disabled asset classes from the authoritative server_watch
    // rows (a class is "off" when it has watches and none are enabled). This is
    // the source of truth the client hydrates its category toggles from, so the
    // UI reflects the server rather than stale localStorage.
    const disabledAssetClasses = await computeDisabledAssetClasses(session.user.id);

    if (records.length === 0) {
      return NextResponse.json({
        watchlist: null,
        patternId: DEFAULT_PATTERN_ID,
        patternIds: [DEFAULT_PATTERN_ID],
        minMovePercent: 0.25,
        requiredCandleCount: 3,
        patternSettings: normalizePatternSettings(null, 0.25),
        disabledAssetClasses,
        authenticated: true,
        watchlistLimit,
      });
    }

    const record = records[0];
    return NextResponse.json({
      watchlist: record.watchlist,
      patternId: parsePatternId(record.patternId),
      patternIds: parsePatternIds(record.patternIds, parsePatternId(record.patternId)),
      minMovePercent: parseMinMovePercent(record.minMovePercent),
      requiredCandleCount: parseRequiredCandleCount(record.requiredCandleCount),
      maxBodyOverlapPercent: parseMaxBodyOverlapPercent(record.maxBodyOverlapPercent),
      patternSettings: normalizePatternSettings(record.patternSettings, record.minMovePercent),
      session: parseSession(record.session),
      scanFrequencySeconds: record.scanFrequencySeconds,
      disabledAssetClasses,
      authenticated: true,
      watchlistLimit,
    });
  } catch (error) {
    console.error('Failed to fetch user watchlist from DB:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({
        success: false,
        authenticated: false,
        watchlistLimit: GUEST_WATCHLIST_LIMIT,
      }, { status: 200 });
    }
    const watchlistLimit = accountWatchlistLimit(session.user.email);

    const body = await request.json();
    if (!Array.isArray(body.watchlist)) {
      return NextResponse.json({ error: 'Invalid watchlist format' }, { status: 400 });
    }

    const watchlist = cleanWatchlist(body.watchlist);
    const patternId = parsePatternId(body.patternId);
    const patternIds = parsePatternIds(body.patternIds, patternId);
    const minMovePercent = parseMinMovePercent(body.minMovePercent);
    const requiredCandleCount = parseRequiredCandleCount(
      body.requiredCandleCount,
    );
    const maxBodyOverlapPercent = parseMaxBodyOverlapPercent(
      body.maxBodyOverlapPercent,
    );
    const patternSettings = normalizePatternSettings(body.patternSettings, minMovePercent);
    const watchSession = parseSession(body.session);
    const scanFrequencySeconds = parseScanFrequency(body.scanFrequencySeconds);
    const disabledAssetClasses = parseDisabledAssetClasses(body.disabledAssetClasses);
    const userId = session.user.id;
    const nowIso = new Date().toISOString();

    const currentRecords = await db
      .select({ watchlist: userWatchlists.watchlist })
      .from(userWatchlists)
      .where(eq(userWatchlists.userId, userId))
      .limit(1);
    const currentWatchlist = currentRecords[0]?.watchlist;
    const currentCount = Array.isArray(currentWatchlist) ? currentWatchlist.length : 0;

    if (!canPersistAuthenticatedWatchlist(watchlist.length, currentCount, watchlistLimit)) {
      return NextResponse.json({
        error: `Your watchlist is limited to ${watchlistLimit} symbols.`,
        code: 'WATCHLIST_LIMIT_EXCEEDED',
        limit: watchlistLimit,
        count: watchlist.length,
      }, { status: 422 });
    }

    await db.transaction(async (tx) => {
      const existingSettings = await tx
        .select()
        .from(userWatchlists)
        .where(eq(userWatchlists.userId, userId))
        .limit(1);

      if (existingSettings.length > 0) {
        await tx
          .update(userWatchlists)
          .set({
            watchlist,
            patternId,
            patternIds,
            minMovePercent,
            requiredCandleCount,
            maxBodyOverlapPercent,
            patternSettings,
            session: watchSession,
            scanFrequencySeconds,
            updatedAt: nowIso,
          })
          .where(eq(userWatchlists.userId, userId));
      } else {
        await tx.insert(userWatchlists).values({
          userId,
          watchlist,
          patternId,
          patternIds,
          minMovePercent,
          requiredCandleCount,
          maxBodyOverlapPercent,
          patternSettings,
          session: watchSession,
          scanFrequencySeconds,
          updatedAt: nowIso,
        });
      }

      const existingWatches = await tx
        .select()
        .from(serverWatch)
        .where(eq(serverWatch.userId, userId));
      const desiredKeys = new Set(watchlist.map((watch) => `${watch.symbol}\u0000${watch.interval}`));

      for (const existing of existingWatches) {
        const key = `${existing.symbol}\u0000${existing.interval}`;
        if (!desiredKeys.has(key)) {
          await tx.delete(serverWatch).where(eq(serverWatch.id, existing.id));
        }
      }

      for (const watch of watchlist) {
        const assetClass = assetClassFor(watch.symbol);
        // Watches in a switched-off asset class sync as disabled, so the
        // scheduler/worker skip them (no scans, alerts, or push) until re-enabled.
        const enabled = !disabledAssetClasses.has(assetClass);
        await tx
          .insert(serverWatch)
          .values({
            userId,
            symbol: watch.symbol,
            assetClass,
            interval: watch.interval,
            patternId,
            patternIds,
            minMovePercent,
            requiredCandleCount,
            maxBodyOverlapPercent,
            patternSettings,
            session: watchSession,
            enabled,
            scanFrequencySeconds,
            nextScanAt: nowIso,
            updatedAt: nowIso,
          })
          .onConflictDoUpdate({
            target: [serverWatch.userId, serverWatch.symbol, serverWatch.interval],
            set: {
              assetClass,
              patternId,
              patternIds,
              minMovePercent,
              requiredCandleCount,
              maxBodyOverlapPercent,
              patternSettings,
              session: watchSession,
              enabled,
              scanFrequencySeconds,
              updatedAt: nowIso,
            },
          });
      }
    });

    return NextResponse.json({
      success: true,
      count: watchlist.length,
      patternId,
      patternIds,
      minMovePercent,
      requiredCandleCount,
      maxBodyOverlapPercent,
      patternSettings,
      watchlistLimit,
    });
  } catch (error) {
    console.error('Failed to sync watchlist to DB:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/server';
import { serverWatch, userWatchlists } from '@/lib/db/server/schema';
import {
  DEFAULT_PATTERN_ID,
  isPatternId,
  type PatternId,
} from '@/lib/scanner/patterns';
import type { AssetClass, WatchSession } from '@/lib/scanner/sessions';

const DEFAULT_SCAN_FREQUENCY_SECONDS = 600;
const VALID_SESSIONS = new Set<WatchSession>(['rth', 'pre', 'ext', 'all']);

interface SyncedWatch {
  symbol: string;
  interval: string;
  minMovePercent: number;
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
    const rawMinMove = typeof candidate.minMovePercent === 'number'
      ? candidate.minMovePercent
      : 0.1;
    const minMovePercent = Number.isFinite(rawMinMove)
      ? Math.max(0, rawMinMove)
      : 0.1;
    unique.set(`${symbol}\u0000${interval}`, { symbol, interval, minMovePercent });
  }
  return [...unique.values()];
};

const parsePatternId = (value: unknown): PatternId =>
  isPatternId(value) ? value : DEFAULT_PATTERN_ID;

const parseSession = (value: unknown): WatchSession =>
  typeof value === 'string' && VALID_SESSIONS.has(value as WatchSession)
    ? value as WatchSession
    : 'pre';

const parseScanFrequency = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_SCAN_FREQUENCY_SECONDS;
  }
  return Math.max(60, Math.min(86_400, Math.round(value)));
};

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ watchlist: null, authenticated: false }, { status: 200 });
    }

    const records = await db
      .select()
      .from(userWatchlists)
      .where(eq(userWatchlists.userId, session.user.id))
      .limit(1);

    if (records.length === 0) {
      return NextResponse.json({
        watchlist: null,
        patternId: DEFAULT_PATTERN_ID,
        authenticated: true,
      });
    }

    const record = records[0];
    return NextResponse.json({
      watchlist: record.watchlist,
      patternId: parsePatternId(record.patternId),
      session: parseSession(record.session),
      scanFrequencySeconds: record.scanFrequencySeconds,
      authenticated: true,
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
      return NextResponse.json({ success: false, authenticated: false }, { status: 200 });
    }

    const body = await request.json();
    if (!Array.isArray(body.watchlist)) {
      return NextResponse.json({ error: 'Invalid watchlist format' }, { status: 400 });
    }

    const watchlist = cleanWatchlist(body.watchlist);
    const patternId = parsePatternId(body.patternId);
    const watchSession = parseSession(body.session);
    const scanFrequencySeconds = parseScanFrequency(body.scanFrequencySeconds);
    const userId = session.user.id;
    const nowIso = new Date().toISOString();

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
        await tx
          .insert(serverWatch)
          .values({
            userId,
            symbol: watch.symbol,
            assetClass: assetClassFor(watch.symbol),
            interval: watch.interval,
            patternId,
            minMovePercent: watch.minMovePercent,
            session: watchSession,
            enabled: true,
            scanFrequencySeconds,
            nextScanAt: nowIso,
            updatedAt: nowIso,
          })
          .onConflictDoUpdate({
            target: [serverWatch.userId, serverWatch.symbol, serverWatch.interval],
            set: {
              assetClass: assetClassFor(watch.symbol),
              patternId,
              minMovePercent: watch.minMovePercent,
              session: watchSession,
              enabled: true,
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
    });
  } catch (error) {
    console.error('Failed to sync watchlist to DB:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

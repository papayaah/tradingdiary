// Acquisition inventory for the cadence governor (Phase 6).
//
// N — the number of unique enabled, in-session acquisition keys per provider
// scope — is what the governor throttles on (never raw watch count). This module
// resolves enabled, in-session watches into that inventory, plus the fastest
// requested cadence and the active session window per scope, all provider-aware
// (same resolution the shared cache uses). Disabled and out-of-session watches
// never contribute — exactly like the shared fetch itself.

import { eq } from 'drizzle-orm';
import { db } from '@/lib/scanner/db';
import { serverWatch } from '@/lib/db/server/schema';
import { isSessionActive, type AssetClass, type WatchSession } from '@/lib/scanner/sessions';
import { resolveProviderIdentity } from './provider-scope';
import { getProviderCapability } from './provider-capabilities';
import { canonicalizeSymbol } from './canonical-symbol';
import { parseIntervalMinutes } from './aggregate';

const HOUR = 3600;

/** Active session window length (seconds) — a longer window forces a slower per-fetch cadence. */
export function sessionWindowSeconds(session: WatchSession, assetClass: AssetClass): number {
  if (assetClass !== 'equity') return 24 * HOUR; // futures/crypto: treated as always-on
  switch (session) {
    case 'rth':
      return 6.5 * HOUR; // 09:30–16:00 ET
    case 'pre':
      return 12 * HOUR; // 04:00–16:00 ET (UI "pre" = pre + regular)
    case 'ext':
      return 16 * HOUR; // 04:00–20:00 ET
    default:
      return 16 * HOUR; // equity 'all' = every available intraday hour
  }
}

export interface AcquisitionEntry {
  providerScope: string;
  providerName: string;
  canonicalSymbol: string;
  interval: string;
  scanFrequencySeconds: number;
  windowSeconds: number;
  monthlyBarSeconds: number;
}

export interface ScopeInventory {
  providerScope: string;
  providerName: string;
  uniqueKeys: number;
  fastestRequestedSeconds: number;
  windowSeconds: number;
  monthlyBarSeconds: number;
}

/** Resolve one watch into its acquisition entry (provider-aware; no upstream request). */
export function entryForWatch(watch: {
  symbol: string;
  interval: string;
  assetClass: string;
  session: string;
  scanFrequencySeconds: number;
}): AcquisitionEntry {
  const assetClass = watch.assetClass as AssetClass;
  const { providerName, providerScope } = resolveProviderIdentity(watch.symbol, assetClass);
  const capability = getProviderCapability(providerName, assetClass);
  const windowSeconds = sessionWindowSeconds(watch.session as WatchSession, assetClass);
  const intervalMinutes = parseIntervalMinutes(watch.interval) ?? 1;
  const estimatedBars = Math.max(1, Math.ceil(windowSeconds / (intervalMinutes * 60)));
  const activeDaysPerMonth = assetClass === 'equity' ? 22 : 30;
  return {
    providerScope,
    providerName,
    canonicalSymbol: canonicalizeSymbol(watch.symbol, assetClass, capability),
    interval: watch.interval,
    scanFrequencySeconds: watch.scanFrequencySeconds,
    windowSeconds,
    monthlyBarSeconds: estimatedBars * windowSeconds * activeDaysPerMonth,
  };
}

/**
 * Fold acquisition entries into per-scope inventory: N = distinct
 * (canonicalSymbol, interval); fastest requested cadence = min scanFrequency;
 * window = the longest active session window in the scope (most conservative for
 * the daily-budget term).
 */
export function computeInventory(entries: AcquisitionEntry[]): ScopeInventory[] {
  const byScope = new Map<
    string,
    { providerName: string; keys: Map<string, number>; fastest: number; window: number }
  >();

  for (const e of entries) {
    let s = byScope.get(e.providerScope);
    if (!s) {
      s = { providerName: e.providerName, keys: new Map(), fastest: Infinity, window: 0 };
      byScope.set(e.providerScope, s);
    }
    const key = `${e.canonicalSymbol}\u0000${e.interval}`;
    s.keys.set(key, Math.max(s.keys.get(key) ?? 0, e.monthlyBarSeconds));
    if (e.scanFrequencySeconds < s.fastest) s.fastest = e.scanFrequencySeconds;
    if (e.windowSeconds > s.window) s.window = e.windowSeconds;
  }

  return [...byScope].map(([providerScope, s]) => ({
    providerScope,
    providerName: s.providerName,
    uniqueKeys: s.keys.size,
    fastestRequestedSeconds: Number.isFinite(s.fastest) ? s.fastest : 0,
    windowSeconds: s.window,
    monthlyBarSeconds: [...s.keys.values()].reduce((total, value) => total + value, 0),
  }));
}

/**
 * Load the current inventory from PostgreSQL: enabled watches that are in session
 * right now, folded per provider scope. Used by the governor's recompute loop.
 */
export async function loadScopeInventory(now: Date = new Date()): Promise<ScopeInventory[]> {
  const rows = await db.select().from(serverWatch).where(eq(serverWatch.enabled, true));
  const entries: AcquisitionEntry[] = [];
  for (const w of rows) {
    if (!isSessionActive(w.session as WatchSession, w.assetClass as AssetClass, now)) continue;
    entries.push(entryForWatch(w));
  }
  return computeInventory(entries);
}

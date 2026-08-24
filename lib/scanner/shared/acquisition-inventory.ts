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
import { scannerConfig } from '@/lib/scanner/env';
import type { AssetClass, WatchSession } from '@/lib/scanner/sessions';
import { resolveProviderIdentity } from './provider-scope';
import { getProviderCapability, type ProviderCapability } from './provider-capabilities';
import { canonicalizeSymbol } from './canonical-symbol';
import { parseIntervalMinutes, BASE_INTERVAL } from './aggregate';
import { isMarketDataAssetClassEnabled } from '@/lib/features/market-data';

const HOUR = 3600;

/**
 * The interval actually fetched upstream for a watch. This MUST mirror
 * `SharedCandleService.getCandlesForWatch`: when aggregation is enabled and the
 * provider derives from 1m, every minute-based interval collapses onto the single
 * 1m base series, so a symbol watched at 1m/5m/10m/15m is ONE acquisition, not
 * four. Non-minute intervals (e.g. seconds) and non-aggregatable providers keep
 * their native interval. If this drifts from the fetch path, the governor's N no
 * longer matches real upstream volume.
 */
export function acquisitionInterval(
  interval: string,
  capability: ProviderCapability,
  aggregationEnabled: boolean = scannerConfig.aggregationEnabled,
): string {
  const minutes = parseIntervalMinutes(interval);
  if (aggregationEnabled && capability.aggregatableFrom1m && minutes !== null) {
    return BASE_INTERVAL;
  }
  return interval;
}

/** Active session window length (seconds) — a longer window forces a slower per-fetch cadence. */
export function sessionWindowSeconds(_session: WatchSession, assetClass: AssetClass): number {
  if (assetClass !== 'equity') return 24 * HOUR; // futures/crypto: treated as always-on
  return 16 * HOUR; // provider-owned 04:00–20:00 ET, independent of user session
}

/** Server-owned acquisition calendar; user watch sessions never affect it. */
export function isProviderAcquisitionActive(assetClass: AssetClass, now = new Date()): boolean {
  if (assetClass !== 'equity') return true;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const weekday = value('weekday');
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  const minutes = Number(value('hour')) * 60 + Number(value('minute'));
  return minutes >= 4 * 60 && minutes < 20 * 60;
}

export interface AcquisitionEntry {
  /** Shared entitlement/quota/cache scope (per provider plan), e.g. "tiingo:server". */
  providerScope: string;
  /** Per-provider×class governor cadence scope, e.g. "tiingo:crypto:server". */
  cadenceScope: string;
  providerName: string;
  canonicalSymbol: string;
  interval: string;
  scanFrequencySeconds: number;
  windowSeconds: number;
  monthlyBarSeconds: number;
  sourceSymbol: string;
  assetClass: AssetClass;
  minimumCadenceSeconds?: number;
}

export interface ScopeInventory {
  /** Governor cadence scope this inventory row is keyed by (per class). */
  cadenceScope: string;
  /** Shared entitlement scope for budget/usage lookup (may cover sibling classes). */
  entitlementScope: string;
  assetClass: AssetClass;
  providerName: string;
  uniqueKeys: number;
  providerTargetSeconds: number;
  windowSeconds: number;
  monthlyBarSeconds: number;
}

/** Resolve one watch into its acquisition entry (provider-aware; no upstream request). */
export function entryForWatch(
  watch: {
    symbol: string;
    interval: string;
    assetClass: string;
    session: string;
    scanFrequencySeconds: number;
  },
  aggregationEnabled: boolean = scannerConfig.aggregationEnabled,
): AcquisitionEntry {
  const assetClass = watch.assetClass as AssetClass;
  const { providerName, providerScope, cadenceScope } = resolveProviderIdentity(watch.symbol, assetClass);
  const capability = getProviderCapability(providerName, assetClass);
  const windowSeconds = sessionWindowSeconds('all', assetClass);
  // Count and size the entry by the interval actually fetched (the 1m base when
  // aggregation collapses this symbol), not the user's display interval.
  const interval = acquisitionInterval(watch.interval, capability, aggregationEnabled);
  const intervalMinutes = parseIntervalMinutes(interval) ?? 1;
  const estimatedBars = Math.max(1, Math.ceil(windowSeconds / (intervalMinutes * 60)));
  const activeDaysPerMonth = assetClass === 'equity' ? 22 : 30;
  return {
    providerScope,
    cadenceScope,
    providerName,
    canonicalSymbol: canonicalizeSymbol(watch.symbol, assetClass, capability),
    interval,
    scanFrequencySeconds: watch.scanFrequencySeconds,
    windowSeconds,
    // The bandwidth governor divides this demand by its candidate cadence.
    // Include every active second in the month so the result models repeated
    // full-window responses, not a single response per trading day.
    monthlyBarSeconds: estimatedBars * windowSeconds * activeDaysPerMonth,
    sourceSymbol: watch.symbol,
    assetClass,
  };
}

/**
 * Fold acquisition entries into per-scope inventory: N = distinct
 * (canonicalSymbol, interval); cadence demand is server-owned and therefore
 * does not inspect a user's scan frequency;
 * window = the longest active session window in the scope (most conservative for
 * the daily-budget term).
 */
export function computeInventory(entries: AcquisitionEntry[]): ScopeInventory[] {
  const byScope = new Map<
    string,
    {
      entitlementScope: string;
      assetClass: AssetClass;
      providerName: string;
      keys: Map<string, number>;
      fastest: number;
      window: number;
    }
  >();

  for (const e of entries) {
    // Group by cadence scope so each provider×class gets its own N, cadence, and
    // manual override — even when two classes share one provider entitlement.
    let s = byScope.get(e.cadenceScope);
    if (!s) {
      s = {
        entitlementScope: e.providerScope,
        assetClass: e.assetClass,
        providerName: e.providerName,
        keys: new Map(),
        fastest: Infinity,
        window: 0,
      };
      byScope.set(e.cadenceScope, s);
    }
    const key = `${e.canonicalSymbol}\u0000${e.interval}`;
    s.keys.set(key, Math.max(s.keys.get(key) ?? 0, e.monthlyBarSeconds));
    s.fastest = 0;
    if (e.windowSeconds > s.window) s.window = e.windowSeconds;
  }

  return [...byScope].map(([cadenceScope, s]) => ({
    cadenceScope,
    entitlementScope: s.entitlementScope,
    assetClass: s.assetClass,
    providerName: s.providerName,
    uniqueKeys: s.keys.size,
    providerTargetSeconds: Number.isFinite(s.fastest) ? s.fastest : 0,
    windowSeconds: s.window,
    monthlyBarSeconds: [...s.keys.values()].reduce((total, value) => total + value, 0),
  }));
}

/**
 * Load the current inventory from PostgreSQL: enabled watches that are in session
 * right now, folded per provider scope. Used by the governor's recompute loop.
 */
export async function loadScopeInventory(
  now: Date = new Date(),
  aggregationEnabled: boolean = scannerConfig.aggregationEnabled,
): Promise<ScopeInventory[]> {
  const rows = await db.select().from(serverWatch).where(eq(serverWatch.enabled, true));
  const entries: AcquisitionEntry[] = [];
  for (const w of rows) {
    if (!isMarketDataAssetClassEnabled(w.assetClass)) continue;
    if (!isProviderAcquisitionActive(w.assetClass as AssetClass, now)) continue;
    entries.push(entryForWatch(w, aggregationEnabled));
  }
  return computeInventory(entries);
}

/** Unique provider-owned series acquired by the scanner, oldest-first later. */
export async function loadAcquisitionSeries(
  now: Date = new Date(),
  aggregationEnabled: boolean = scannerConfig.aggregationEnabled,
): Promise<AcquisitionEntry[]> {
  const rows = await db.select().from(serverWatch).where(eq(serverWatch.enabled, true));
  const unique = new Map<string, AcquisitionEntry>();
  for (const watch of rows) {
    const assetClass = watch.assetClass as AssetClass;
    if (!isMarketDataAssetClassEnabled(assetClass)) continue;
    if (!isProviderAcquisitionActive(assetClass, now)) continue;
    const entry = entryForWatch(watch, aggregationEnabled);
    const key = `${entry.providerScope}\u0000${entry.canonicalSymbol}\u0000${entry.interval}`;
    if (!unique.has(key)) unique.set(key, entry);

    // The prior official close/settlement is an independent, slow-moving daily
    // series used for the displayed market-day change. It is acquired every six
    // hours and shared by every watch for the same symbol.
    if (assetClass === 'equity' || assetClass === 'futures') {
      const daily = { ...entry, interval: '1d', minimumCadenceSeconds: 6 * HOUR };
      const dailyKey = `${daily.providerScope}\u0000${daily.canonicalSymbol}\u0000${daily.interval}`;
      if (!unique.has(dailyKey)) unique.set(dailyKey, daily);
    }
  }
  return [...unique.values()];
}

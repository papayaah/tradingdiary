// Aggregation parity check (Phase 7 prerequisite of shared-market-data-scanning).
//
// Before we trust derived candles for alerts, we must prove that deriving an
// interval from the 1m base (see aggregate.ts) reproduces the provider's own
// native candles for that interval. This module compares a derived series
// against a native series bucket-by-bucket and reports every mismatch, so a
// clean report is the gate for flipping SCANNER_AGGREGATION on.
//
// Pure and deterministic: it takes candle arrays and returns a report. Fetching
// the two series (native + 1m base) and logging lives in the dev script
// (dev-parity.ts), so nothing here touches the provider or the hot path.

import type { Candle } from '@/lib/scanner/patterns';
import { aggregateCandles, parseIntervalMinutes } from './aggregate';

export type ParityField = 'open' | 'high' | 'low' | 'close' | 'volume';

export interface ParityMismatch {
  time: number; // bucket start (epoch seconds)
  field: ParityField | 'missing-native' | 'missing-derived';
  native?: number;
  derived?: number;
  relDiff?: number; // |native-derived| / max(|native|,epsilon)
}

export interface ParityReport {
  interval: string;
  ok: boolean; // true iff no mismatches survived (within tolerance)
  reason?: string; // set when derivation itself failed (never a fabricated series)
  nativeCount: number;
  derivedCount: number;
  comparedBuckets: number; // buckets present on BOTH sides that were checked
  ignoredLatestPartial: boolean;
  mismatches: ParityMismatch[];
}

export interface ParityOptions {
  /** Max relative difference for OHLC prices before it counts as a mismatch. */
  priceTolerance?: number;
  /** Max relative difference for volume (feeds often diverge slightly on volume). */
  volumeTolerance?: number;
  /**
   * Drop the most recent bucket on both sides before comparing. The latest
   * candle is typically still forming, so native and derived legitimately differ
   * there. On by default.
   */
  ignoreLatestPartial?: boolean;
  /** Cap the number of reported mismatches (the report stays bounded). */
  maxMismatches?: number;
}

const DEFAULTS: Required<ParityOptions> = {
  priceTolerance: 1e-4, // 0.01% — accommodates float rounding, not real drift
  volumeTolerance: 1e-3,
  ignoreLatestPartial: true,
  maxMismatches: 50,
};

function relDiff(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) / denom;
}

/**
 * Compare candles derived from a 1m `base` against the provider's `native`
 * candles at `targetInterval`. Returns ok:false with a reason when the base
 * cannot be derived at all (unsupported interval, inconsistent bars) — the same
 * conditions under which the live path falls back to a native fetch.
 */
export function compareDerivedToNative(
  base: Candle[],
  native: Candle[],
  targetInterval: string,
  options: ParityOptions = {},
): ParityReport {
  const opts = { ...DEFAULTS, ...options };
  const minutes = parseIntervalMinutes(targetInterval);

  const derivedResult = aggregateCandles(base, targetInterval);
  if (!derivedResult.ok) {
    return {
      interval: targetInterval,
      ok: false,
      reason: derivedResult.reason ?? 'derivation failed',
      nativeCount: native.length,
      derivedCount: 0,
      comparedBuckets: 0,
      ignoredLatestPartial: false,
      mismatches: [],
    };
  }

  let derived = derivedResult.candles;
  let nativeSeries = native;

  // Drop the still-forming latest bucket on both sides so an in-progress candle
  // is never scored as a mismatch. We drop the max bucket-start present on
  // either side (they should agree, but be defensive).
  let ignoredLatestPartial = false;
  if (opts.ignoreLatestPartial && minutes && minutes > 0) {
    const bucketSeconds = minutes * 60;
    const latestDerived = derived.length ? derived[derived.length - 1].time : -Infinity;
    const latestNative = nativeSeries.length
      ? Math.floor(nativeSeries[nativeSeries.length - 1].time / bucketSeconds) * bucketSeconds
      : -Infinity;
    const cutoff = Math.max(latestDerived, latestNative);
    if (Number.isFinite(cutoff)) {
      derived = derived.filter((c) => c.time < cutoff);
      nativeSeries = nativeSeries.filter(
        (c) => Math.floor(c.time / bucketSeconds) * bucketSeconds < cutoff,
      );
      ignoredLatestPartial = true;
    }
  }

  // Index native by bucket-start so alignment is by time, not by position
  // (either side may be missing a bucket around a session gap).
  const bucketSeconds = (minutes ?? 1) * 60;
  const nativeByBucket = new Map<number, Candle>();
  for (const c of nativeSeries) {
    nativeByBucket.set(Math.floor(c.time / bucketSeconds) * bucketSeconds, c);
  }
  const derivedByBucket = new Map<number, Candle>();
  for (const c of derived) derivedByBucket.set(c.time, c);

  const mismatches: ParityMismatch[] = [];
  const push = (m: ParityMismatch) => {
    if (mismatches.length < opts.maxMismatches) mismatches.push(m);
  };

  let comparedBuckets = 0;
  const allBuckets = new Set<number>([...nativeByBucket.keys(), ...derivedByBucket.keys()]);
  for (const bucket of [...allBuckets].sort((a, b) => a - b)) {
    const n = nativeByBucket.get(bucket);
    const d = derivedByBucket.get(bucket);
    if (!n) {
      push({ time: bucket, field: 'missing-native', derived: d?.close });
      continue;
    }
    if (!d) {
      push({ time: bucket, field: 'missing-derived', native: n.close });
      continue;
    }
    comparedBuckets += 1;
    const checks: Array<[ParityField, number, number, number]> = [
      ['open', n.open, d.open, opts.priceTolerance],
      ['high', n.high, d.high, opts.priceTolerance],
      ['low', n.low, d.low, opts.priceTolerance],
      ['close', n.close, d.close, opts.priceTolerance],
      ['volume', n.volume, d.volume, opts.volumeTolerance],
    ];
    for (const [field, nv, dv, tol] of checks) {
      const rd = relDiff(nv, dv);
      if (rd > tol) push({ time: bucket, field, native: nv, derived: dv, relDiff: rd });
    }
  }

  return {
    interval: targetInterval,
    ok: mismatches.length === 0,
    nativeCount: native.length,
    derivedCount: derivedResult.candles.length,
    comparedBuckets,
    ignoredLatestPartial,
    mismatches,
  };
}

/** One-line human summary of a report, for dev-script logging. */
export function formatParityReport(symbol: string, report: ParityReport): string {
  const head = `${symbol} ${report.interval}: ${report.ok ? 'OK' : 'MISMATCH'}`;
  if (report.reason) return `${head} (derivation failed: ${report.reason})`;
  const detail =
    `compared=${report.comparedBuckets} native=${report.nativeCount} ` +
    `derived=${report.derivedCount} mismatches=${report.mismatches.length}` +
    (report.ignoredLatestPartial ? ' (latest partial ignored)' : '');
  return `${head} ${detail}`;
}

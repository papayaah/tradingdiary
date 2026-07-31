// Canonical market-data acquisition key (Phase 1 of shared-market-data-scanning).
//
// The key identifies a candle snapshot that may safely be reused across every
// watch — regardless of user, device, pattern, or threshold — that needs the
// same market data. Patterns and thresholds are deliberately NOT part of the
// key: they are per-watch evaluation inputs, not acquisition inputs. Two watches
// share a fetch only when all five acquisition dimensions match:
//
//   providerScope   entitlement/credential identity (never a raw key/secret)
//   canonicalSymbol  normalized symbol for the selected provider
//   interval         requested provider interval (e.g. "1m", "10m")
//   fetchScope       request details that change the returned candles
//                    (session, lookback, adjustment, volume requirement, ...)
//   timeBucket       acquisition window that bounds reuse and makes retries
//                    deterministic (e.g. the current UTC minute)
//
// This module is pure (no provider, Redis, or clock imports) so it is trivially
// testable and safe to import anywhere.

export interface MarketDataRequest {
  providerScope: string;
  canonicalSymbol: string;
  interval: string;
  fetchScope: string;
  timeBucket: number;
}

export const ACQUISITION_KEY_PREFIX = 'market-data:v1';

// Each component is percent-encoded before joining on ':'. encodeURIComponent
// leaves ':' → %3A, so no component can inject an extra separator and the key
// round-trips exactly. Raw credentials must never be placed in providerScope.
function encode(part: string): string {
  return encodeURIComponent(part);
}

/** Build the canonical acquisition key string for a market-data request. */
export function buildAcquisitionKey(request: MarketDataRequest): string {
  if (!Number.isInteger(request.timeBucket) || request.timeBucket < 0) {
    throw new Error(`invalid timeBucket: ${request.timeBucket}`);
  }
  return [
    ACQUISITION_KEY_PREFIX,
    encode(request.providerScope),
    encode(request.canonicalSymbol),
    encode(request.interval),
    encode(request.fetchScope),
    String(request.timeBucket),
  ].join(':');
}

/** Parse a canonical acquisition key back into its request (inverse of build). */
export function parseAcquisitionKey(key: string): MarketDataRequest {
  const parts = key.split(':');
  // prefix is "market-data:v1" (two colon-separated tokens) + 5 components.
  if (parts.length !== 7 || `${parts[0]}:${parts[1]}` !== ACQUISITION_KEY_PREFIX) {
    throw new Error(`malformed acquisition key: ${key}`);
  }
  const timeBucket = Number(parts[6]);
  if (!Number.isInteger(timeBucket) || timeBucket < 0) {
    throw new Error(`malformed acquisition key (timeBucket): ${key}`);
  }
  return {
    providerScope: decodeURIComponent(parts[2]),
    canonicalSymbol: decodeURIComponent(parts[3]),
    interval: decodeURIComponent(parts[4]),
    fetchScope: decodeURIComponent(parts[5]),
    timeBucket,
  };
}

/**
 * Normalize a symbol into its canonical form for keying.
 *
 * Phase 1 only collapses case/whitespace variants (e.g. "aapl" and "AAPL"),
 * which is enough to dedupe the common overlap. Full provider-aware
 * normalization — mapping futures notations (MNQU6, /MNQ, MNQ=F) and crypto
 * separators (BTCUSD vs BTC-USD) to a single provider request — is Phase 3
 * (provider capability registry) and intentionally not attempted here.
 */
export function canonicalSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/**
 * The fetch scope encodes provider request details that materially change the
 * returned candles. Every current scanner fetch uses `fetchRecentCandles`, which
 * requests a recent multi-day window with extended hours on, so Phase 1 uses one
 * constant scope. Later phases widen this to the *union* of participating
 * detectors' data requirements (volume presence, maximum lookback) so a shared
 * snapshot always satisfies the hungriest watch sharing it.
 */
export function defaultFetchScope(): string {
  return 'recent:ext';
}

/**
 * The acquisition time bucket: a monotonically increasing integer that changes
 * once per `bucketMs`. Requests in the same bucket may share a snapshot; a new
 * bucket forces a fresh fetch. Passing an explicit `nowMs` keeps callers (and
 * tests) deterministic.
 */
export function currentTimeBucket(nowMs: number, bucketMs: number): number {
  if (!(bucketMs > 0)) throw new Error(`invalid bucketMs: ${bucketMs}`);
  return Math.floor(nowMs / bucketMs);
}

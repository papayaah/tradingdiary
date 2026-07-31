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

// Symbol normalization (provider-aware) and fetch-scope derivation live in
// canonical-symbol.ts; provider scope in provider-scope.ts. This module stays a
// pure key codec so it is trivially testable.

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

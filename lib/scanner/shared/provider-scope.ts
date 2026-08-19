// Resolves the provider entitlement scope for a symbol without triggering an
// upstream request.
//
// `getActiveProvider(symbol)` is deterministic for a given symbol and server
// environment, and merely *constructing* the provider records nothing — only
// invoking `fetchRecentCandles`/`fetchCandles` (through `trackProvider`) counts
// a request. So we can safely call it to learn which provider will serve a
// symbol and derive a scope string, and be certain the same provider then
// performs the actual fetch inside the acquisition service.
//
// Phase 1 runs entirely on server-wide env credentials (per-user keys live in
// browser cookies and never reach the scanner — see the spec's Prerequisites),
// so every scope is a ":server" scope. When per-user credentials become
// server-authoritative, this is where a non-reversible credential identifier
// (never the raw key) would be appended to partition the cache.

import { getActiveProvider, FallbackProvider } from '@/lib/chart/providers';
import type { AssetClass } from '@/lib/scanner/sessions';

/** Lowercase, punctuation-collapsed provider label safe for a Redis key. */
function slugifyProvider(name: string): string {
  // Tiingo equity and crypto endpoints consume the same server API key/plan,
  // so they share one entitlement/quota scope. Fetch scope still keeps their
  // snapshots technically isolated.
  const quotaOwner = name === 'Tiingo Crypto'
    ? 'Tiingo'
    : name === 'IBKR (Stocks)'
      ? 'IBKR (CME)'
      : name;
  return quotaOwner
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface ProviderIdentity {
  /** ChartProvider.name of the provider that will serve this symbol. */
  providerName: string;
  /** Credential/entitlement scope for the cache key, e.g. "polygon-io:server". */
  providerScope: string;
}

/**
 * Resolve both the provider name (for capability lookup) and its scope (for the
 * cache key) in one call, without triggering an upstream request. Contains only
 * the public provider identity — never a raw API key, token, or secret.
 */
export function resolveProviderIdentity(symbol: string, assetClass?: AssetClass): ProviderIdentity {
  const provider = getActiveProvider(symbol, undefined, assetClass);
  // For the futures fallback chain, identity is the expected primary source
  // (e.g. "IBKR (CME)"), not the chain wrapper name ("Futures (auto)"), so the
  // capability registry and budget resolve correctly.
  const name = provider instanceof FallbackProvider ? provider.primaryName : provider.name;
  return { providerName: name, providerScope: `${slugifyProvider(name)}:server` };
}

/** Provider scope only (convenience over {@link resolveProviderIdentity}). */
export function resolveProviderScope(symbol: string, assetClass?: AssetClass): string {
  return resolveProviderIdentity(symbol, assetClass).providerScope;
}

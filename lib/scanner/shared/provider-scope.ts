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

import { getActiveProvider } from '@/lib/chart/providers';

/** Lowercase, punctuation-collapsed provider label safe for a Redis key. */
function slugifyProvider(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Provider scope for a symbol under the current server configuration, e.g.
 * "polygon-io:server" or "yahoo-finance:server". Contains only the public
 * provider identity — never a raw API key, token, or secret.
 */
export function resolveProviderScope(symbol: string): string {
  const provider = getActiveProvider(symbol);
  return `${slugifyProvider(provider.name)}:server`;
}

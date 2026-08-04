// Provider-aware symbol normalization + fetch-scope derivation (Phase 3).
//
// The Phase 1 canonicalizer only upper-cased. This normalizes a symbol into the
// exact form the SELECTED provider requests, so equivalent notations collapse to
// one acquisition key (and therefore one upstream fetch) — while genuinely
// different data is never merged just because display labels resemble each other.
// Provider awareness comes from the capability registry, since the same display
// symbol maps differently across providers (e.g. futures ROOT=F on Yahoo vs a
// bare root for IBKR; crypto BTC-USD on Yahoo vs BTCUSD on Tiingo).

import { isFuturesSymbol, futuresRoot } from '@/lib/chart/providers';
import type { AssetClass } from '@/lib/scanner/sessions';
import type { FuturesSymbology, ProviderCapability } from './provider-capabilities';

/**
 * Best-effort asset-class inference from a symbol, for callers without an
 * authoritative class. The scanner passes the watch's stored `assetClass`
 * instead; this is only a fallback. Crypto detection keys on the app's `-USD`
 * pair convention.
 */
export function classifyAssetClass(symbol: string): AssetClass {
  if (isFuturesSymbol(symbol)) return 'futures';
  if (symbol.trim().toUpperCase().endsWith('-USD')) return 'crypto';
  return 'equity';
}

function canonicalFutures(symbol: string, form: FuturesSymbology): string {
  // Reduce any notation (MNQU6, /MNQ, MNQ=F, MNQ.C.0) to the product root, then
  // rebuild the selected provider's form.
  const root = futuresRoot(symbol);
  if (form === 'yahoo') return `${root}=F`;
  return root;
}

function canonicalCrypto(symbol: string, concatenated: boolean): string {
  const cleaned = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); // BTC-USD -> BTCUSD
  if (!cleaned.endsWith('USD') || cleaned.length <= 3) return cleaned; // unknown quote
  const base = cleaned.slice(0, -3);
  return concatenated ? `${base}USD` : `${base}-USD`;
}

/** Normalize a symbol into the selected provider's canonical request form. */
export function canonicalizeSymbol(
  symbol: string,
  assetClass: AssetClass,
  capability: ProviderCapability,
): string {
  if (assetClass === 'futures') return canonicalFutures(symbol, capability.futuresSymbology);
  if (assetClass === 'crypto') return canonicalCrypto(symbol, capability.cryptoConcatenated);
  return symbol.trim().toUpperCase(); // equity: case-only
}

/**
 * Fetch scope for the acquisition key. Encodes provider request characteristics
 * that materially change the returned candles. Volume presence is included so a
 * volumeless fetch can never be reused for a volume-dependent detector once
 * evaluation gates on it (Phase 4). Every current scanner fetch is a recent,
 * extended-hours window, so that part is constant for now.
 */
export function buildFetchScope(capability: ProviderCapability): string {
  return `recent:ext:${capability.returnsVolume ? 'vol' : 'novol'}`;
}

// Provider capability registry (Phase 3 of shared-market-data-scanning).
//
// Records, per market-data provider, the facts the shared-acquisition layer must
// know to reuse a snapshot safely:
//   - returnsVolume: whether the feed carries real volume for this asset class
//     (a volume-dependent detector must not be served a volumeless snapshot);
//   - nativeIntervals / aggregatableFrom1m: which intervals are served natively
//     vs. safe to derive from a 1m base fetch (consumed by Phase 4 aggregation);
//   - futuresSymbology / cryptoConcatenated: how a symbol is written for THIS
//     provider, so equivalent notations canonicalize to one acquisition key.
//
// This is versioned code, not a table, per the spec: add durable storage only if
// these rules can no longer be maintained safely here. Provider names must match
// ChartProvider.name in lib/chart/providers.ts.

import type { AssetClass } from '@/lib/scanner/sessions';

/** How a futures symbol is written for a provider's request/canonical form. */
export type FuturesSymbology = 'yahoo' | 'root';

export interface ProviderCapability {
  provider: string;
  returnsVolume: boolean;
  nativeIntervals: string[];
  aggregatableFrom1m: boolean;
  futuresSymbology: FuturesSymbology;
  /** Crypto request form: true → concatenated (BTCUSD), false → separated (BTC-USD). */
  cryptoConcatenated: boolean;
}

// Conservative fallback for an unrecognized provider: assume volume is present
// (every provider wired today returns it) but never derive higher intervals from
// a base we don't understand, and use the neutral product root for futures.
const DEFAULT_CAPABILITY: Omit<ProviderCapability, 'provider'> = {
  returnsVolume: true,
  nativeIntervals: [],
  aggregatableFrom1m: false,
  futuresSymbology: 'root',
  cryptoConcatenated: false,
};

const EQUITY_INTRADAY = ['1m', '5m', '15m', '30m', '1h'];

const REGISTRY: Record<string, Omit<ProviderCapability, 'provider'>> = {
  'Yahoo Finance': {
    // Serves equities, futures (ROOT=F), and crypto (BASE-USD). No native 10m —
    // the app already derives it from 5m.
    returnsVolume: true,
    nativeIntervals: ['1m', '2m', '5m', '15m', '30m', '60m'],
    aggregatableFrom1m: true,
    futuresSymbology: 'yahoo',
    cryptoConcatenated: false,
  },
  'Polygon.io': {
    returnsVolume: true,
    nativeIntervals: EQUITY_INTRADAY,
    aggregatableFrom1m: true,
    futuresSymbology: 'root',
    cryptoConcatenated: false,
  },
  Tiingo: {
    returnsVolume: true,
    nativeIntervals: EQUITY_INTRADAY,
    aggregatableFrom1m: true,
    futuresSymbology: 'root',
    cryptoConcatenated: false,
  },
  'Tiingo Crypto': {
    returnsVolume: true,
    nativeIntervals: EQUITY_INTRADAY,
    aggregatableFrom1m: true,
    futuresSymbology: 'root',
    cryptoConcatenated: true, // Tiingo's crypto REST endpoint uses BTCUSD
  },
  'Twelve Data': {
    returnsVolume: true,
    nativeIntervals: EQUITY_INTRADAY,
    aggregatableFrom1m: true,
    futuresSymbology: 'root',
    cryptoConcatenated: false,
  },
  'IBKR (CME)': {
    // The futures fetch is a fallback chain (IBKR -> Yahoo), so the
    // canonical symbol must be a form EVERY chain member understands. The =F
    // ("yahoo") form is chain-safe: IBKR reduces it to the root, and Yahoo needs
    // it as-is. A bare root would break Yahoo's fallback. IBKR pulls
    // each interval directly via reqHistoricalData, so no 1m aggregation.
    returnsVolume: true,
    nativeIntervals: [],
    aggregatableFrom1m: false,
    futuresSymbology: 'yahoo',
    cryptoConcatenated: false,
  },
  'IBKR (Stocks)': {
    returnsVolume: true,
    nativeIntervals: ['5s', '10s', '15s', '30s', '1m', '2m', '3m', '5m', '10m', '15m', '30m', '1h', '2h', '4h', '1d'],
    // Keep every interval provider-native: IBKR historical requests have their
    // own pacing/step-size behavior and should not inherit Tiingo aggregation.
    aggregatableFrom1m: false,
    futuresSymbology: 'root',
    cryptoConcatenated: false,
  },
};

/**
 * Capabilities for a provider (by ChartProvider.name). `assetClass` is accepted
 * for forward compatibility (per-asset overrides) though current providers are
 * single-class or fully described by their symbology fields. Unknown providers
 * get the conservative default.
 */
export function getProviderCapability(
  providerName: string,
  _assetClass: AssetClass,
): ProviderCapability {
  const entry = REGISTRY[providerName] ?? DEFAULT_CAPABILITY;
  return { provider: providerName, ...entry };
}

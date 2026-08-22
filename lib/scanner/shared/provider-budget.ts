// Per-provider-scope budget configuration for the cadence governor (Phase 6).
//
// Caps are RUNTIME configuration, not build-time constants: upgrading a provider
// plan is a config change the governor picks up on its next recompute, no
// redeploy. Global defaults come from env; per-scope overrides come from a JSON
// map (SCANNER_PROVIDER_BUDGETS) so, e.g., Tiingo and Polygon can carry different
// caps. Because the formula takes the max over the hourly and daily terms, both
// numbers from a plan must be raised together for an upgrade to speed up cadence.

import { scannerConfig } from '@/lib/scanner/env';
import type { ProviderBudget } from './governor';

function defaultBudget(): ProviderBudget {
  return {
    hourlyCap: scannerConfig.budgetHourlyCap,
    dailyCap: scannerConfig.budgetDailyCap,
    monthlyBandwidthBytes: scannerConfig.budgetMonthlyBandwidthBytes,
    estimatedBytesPerBar: scannerConfig.estimatedResponseBytesPerBar,
    headroom: scannerConfig.budgetHeadroom,
    floorSeconds: scannerConfig.budgetFloorSeconds,
  };
}

// Built-in per-scope defaults for providers whose limits differ sharply from the
// env defaults (which model Tiingo). Env SCANNER_PROVIDER_BUDGETS still wins.
const BUILTIN_OVERRIDES: Record<string, Partial<ProviderBudget>> = {
  // IBKR's hard historical pacing (60 requests / 10 min) applies ONLY to bars of
  // 30 seconds or smaller; 1-minute-and-larger bars have no hard cap, only soft
  // throttling (see https://interactivebrokers.github.io/tws-api/historical_limitations.html).
  // The scanner uses >=1min bars, so the old 300/hr cap needlessly throttled a
  // large watchlist to a ~80-minute refresh cycle (candles went stale, alerts
  // stopped). These caps target a ~3-minute full refresh cycle for ~180 symbols
  // (~3.5k req/hr). IBKR isn't bandwidth-metered; the client-side pacing guard
  // in ibkr-client.ts is the final safety valve.
  'ibkr-cme:server': { hourlyCap: 4000, dailyCap: 100000 },
};

let overrides: Record<string, Partial<ProviderBudget>> | null = null;

function loadOverrides(): Record<string, Partial<ProviderBudget>> {
  if (overrides) return overrides;
  overrides = {};
  const raw = process.env.SCANNER_PROVIDER_BUDGETS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, Partial<ProviderBudget>>;
      if (parsed && typeof parsed === 'object') overrides = parsed;
    } catch {
      // Malformed config must not crash the scanner; fall back to defaults.
    }
  }
  return overrides;
}

/** Budget for a provider scope: global defaults merged with any per-scope override. */
export function getProviderBudget(scope: string): ProviderBudget {
  return { ...defaultBudget(), ...BUILTIN_OVERRIDES[scope], ...loadOverrides()[scope] };
}

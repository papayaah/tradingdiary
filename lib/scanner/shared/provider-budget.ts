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
    headroom: scannerConfig.budgetHeadroom,
    floorSeconds: scannerConfig.budgetFloorSeconds,
  };
}

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
  return { ...defaultBudget(), ...loadOverrides()[scope] };
}

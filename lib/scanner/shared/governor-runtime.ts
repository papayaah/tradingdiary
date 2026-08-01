// Governor recompute loop glue (Phase 6). Ties together the inventory (N per
// scope), the per-scope budget, and measured usage from provider_request_stats,
// updates the CadenceGovernor with hysteresis, and returns per-scope decisions
// for metric logging. Kept separate from the pure governor so the math stays
// unit-testable without a database.

import { scannerConfig } from '@/lib/scanner/env';
import { getProviderStats } from '@/lib/metrics/provider-usage';
import { loadScopeInventory } from './acquisition-inventory';
import { getProviderBudget } from './provider-budget';
import { CadenceGovernor, computeCadenceSeconds, measuredCadenceSeconds } from './governor';

/** A governor sized so that, before any recompute, cadence equals today's fixed bucket. */
export function createGovernor(): CadenceGovernor {
  return new CadenceGovernor({
    hysteresisRatio: scannerConfig.governorHysteresisRatio,
    defaultCadenceSeconds: Math.max(1, Math.round(scannerConfig.acquisitionBucketMs / 1000)),
  });
}

/** Sum today's recorded upstream requests per provider name (measured guardrail input). */
async function usedTodayByProvider(now: Date): Promise<Map<string, number>> {
  const rows = await getProviderStats(1); // today (+ yesterday cutoff); filter to today
  const today = now.toISOString().slice(0, 10);
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.day !== today) continue;
    map.set(row.provider, (map.get(row.provider) ?? 0) + row.count);
  }
  return map;
}

export interface GovernorRecomputeResult {
  providerScope: string;
  cadenceSeconds: number;
  uniqueKeys: number;
  changed: boolean;
}

/**
 * One recompute pass: for every provider scope with enabled, in-session watches,
 * set the effective cadence to max(formula target, measured guardrail) and apply
 * hysteresis. Returns per-scope decisions (caller logs the ones that changed).
 */
export async function recomputeGovernor(
  governor: CadenceGovernor,
  now: Date = new Date(),
): Promise<GovernorRecomputeResult[]> {
  const inventory = await loadScopeInventory(now);
  const usage = await usedTodayByProvider(now);

  return inventory.map((inv) => {
    const budget = getProviderBudget(inv.providerScope);
    const formula = computeCadenceSeconds({
      uniqueKeys: inv.uniqueKeys,
      windowSeconds: inv.windowSeconds,
      monthlyBarSeconds: inv.monthlyBarSeconds,
      fastestRequestedSeconds: inv.fastestRequestedSeconds,
      budget,
    });
    const measured = measuredCadenceSeconds({
      uniqueKeys: inv.uniqueKeys,
      windowSeconds: inv.windowSeconds,
      usableDaily: budget.dailyCap * budget.headroom,
      usedToday: usage.get(inv.providerName) ?? 0,
      floorSeconds: budget.floorSeconds,
    });
    const cadenceSeconds = Math.max(formula, measured);
    const changed = governor.set(inv.providerScope, cadenceSeconds);
    return { providerScope: inv.providerScope, cadenceSeconds, uniqueKeys: inv.uniqueKeys, changed };
  });
}

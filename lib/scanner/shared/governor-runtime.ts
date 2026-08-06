// Governor recompute loop glue (Phase 6). Ties together the inventory (N per
// scope), the per-scope budget, and measured usage from provider_request_stats,
// updates the CadenceGovernor with hysteresis, and returns per-scope decisions
// for metric logging. Kept separate from the pure governor so the math stays
// unit-testable without a database.

import { scannerConfig } from '@/lib/scanner/env';
import { loadScopeInventory } from './acquisition-inventory';
import { getProviderBudget } from './provider-budget';
import { CadenceGovernor, computeCadenceSeconds, measuredCadenceSeconds } from './governor';
import { readUsage } from './request-quota';

/** A governor sized so that, before any recompute, cadence equals today's fixed bucket. */
export function createGovernor(): CadenceGovernor {
  return new CadenceGovernor({
    hysteresisRatio: scannerConfig.governorHysteresisRatio,
    defaultCadenceSeconds: Math.max(1, Math.round(scannerConfig.acquisitionBucketMs / 1000)),
  });
}

export interface GovernorRecomputeResult {
  providerScope: string;
  cadenceSeconds: number;
  uniqueKeys: number;
  changed: boolean;
}

import { getSharedCacheStore } from './cache-store';

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

  const results: GovernorRecomputeResult[] = [];
  const store = getSharedCacheStore();

  for (const inv of inventory) {
    const budget = getProviderBudget(inv.providerScope);
    const usage = await readUsage(store, inv.providerScope, now.getTime());
    const formula = computeCadenceSeconds({
      uniqueKeys: inv.uniqueKeys,
      windowSeconds: inv.windowSeconds,
      monthlyBarSeconds: inv.monthlyBarSeconds,
      providerTargetSeconds: inv.providerTargetSeconds,
      budget,
    });
    const measured = measuredCadenceSeconds({
      uniqueKeys: inv.uniqueKeys,
      windowSeconds: inv.windowSeconds,
      usableDaily: budget.dailyCap * budget.headroom,
      usedToday: usage.daily,
      floorSeconds: budget.floorSeconds,
    });
    const cadenceSeconds = Math.max(formula, measured);
    const changed = governor.set(inv.providerScope, cadenceSeconds);

    const bindingTerm = formula >= measured ? 'formula' : 'measured';
    const predictedReqPerHour = cadenceSeconds > 0 ? Math.round((inv.uniqueKeys * 3600) / cadenceSeconds) : 0;

    if (typeof store.hset === 'function') {
      try {
        await store.hset(`metrics:governor:${inv.providerScope}`, {
          providerScope: inv.providerScope,
          cadenceSeconds: String(cadenceSeconds),
          uniqueKeys: String(inv.uniqueKeys),
          bindingTerm,
          predictedReqPerHour: String(predictedReqPerHour),
          updatedAt: now.toISOString(),
        });
      } catch {
        // Fire-and-forget
      }
    }

    results.push({ providerScope: inv.providerScope, cadenceSeconds, uniqueKeys: inv.uniqueKeys, changed });
  }

  return results;
}

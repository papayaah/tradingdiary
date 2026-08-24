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
import { readScannerControl } from '@/lib/scanner/control';

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
  const { cadenceOverrides } = await readScannerControl();

  const results: GovernorRecomputeResult[] = [];
  const store = getSharedCacheStore();

  // Classes that share one provider entitlement also share its rate/bandwidth
  // cap. Split that cap between them in proportion to each class's N so the
  // per-class auto cadences sum back within the provider's real budget (the hard
  // quota gate still backstops it). Usage is only tracked per entitlement, so it
  // is apportioned the same way for the measured guardrail.
  const totalKeysByEntitlement = new Map<string, number>();
  for (const inv of inventory) {
    totalKeysByEntitlement.set(
      inv.entitlementScope,
      (totalKeysByEntitlement.get(inv.entitlementScope) ?? 0) + inv.uniqueKeys,
    );
  }

  for (const inv of inventory) {
    const baseBudget = getProviderBudget(inv.entitlementScope);
    const totalKeys = totalKeysByEntitlement.get(inv.entitlementScope) ?? inv.uniqueKeys;
    const share = totalKeys > 0 ? inv.uniqueKeys / totalKeys : 1;
    const budget = {
      ...baseBudget,
      hourlyCap: baseBudget.hourlyCap * share,
      dailyCap: baseBudget.dailyCap * share,
      monthlyBandwidthBytes: baseBudget.monthlyBandwidthBytes * share,
    };
    const usage = await readUsage(store, inv.entitlementScope, now.getTime());
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
      usedToday: usage.daily * share,
      floorSeconds: budget.floorSeconds,
    });
    // A manual override wins over the computed cadence, but is clamped to the
    // scope's floor so it can never fetch faster than the provider's hard pacing.
    const override = cadenceOverrides[inv.cadenceScope];
    const hasOverride = typeof override === 'number' && override > 0;
    const cadenceSeconds = hasOverride
      ? Math.max(override, baseBudget.floorSeconds)
      : Math.max(formula, measured);
    const changed = governor.set(inv.cadenceScope, cadenceSeconds);

    const bindingTerm = hasOverride ? 'manual' : formula >= measured ? 'formula' : 'measured';
    const predictedReqPerHour = cadenceSeconds > 0 ? Math.round((inv.uniqueKeys * 3600) / cadenceSeconds) : 0;

    if (typeof store.hset === 'function') {
      try {
        await store.hset(`metrics:governor:${inv.cadenceScope}`, {
          providerScope: inv.cadenceScope,
          entitlementScope: inv.entitlementScope,
          assetClass: inv.assetClass,
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

    results.push({ providerScope: inv.cadenceScope, cadenceSeconds, uniqueKeys: inv.uniqueKeys, changed });
  }

  return results;
}

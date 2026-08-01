// Adaptive acquisition-cadence governor (Phase 6 of shared-market-data-scanning).
//
// The demand rule ("refresh at the fastest cadence any watch requests") answers
// how fast users WANT data; the governor answers how fast the provider budget
// can AFFORD it. Per provider scope it derives an effective acquisition cadence
// from the remaining budget: near real-time when symbols are few, automatically
// slower as the unique-key count N grows, so the provider's rate cap is never
// crossed and cadence degrades smoothly instead of failing with 429s.
//
// The formula is the target; measured usage from provider_request_stats is the
// guardrail (retries, negative-cache misses, and derived-interval refreshes all
// spend real calls the formula does not model). Hysteresis on a coarse recompute
// keeps cadence from oscillating on a boundary. This module is pure state + math;
// the recompute loop and wiring live in main.ts, gated by SCANNER_GOVERNOR.

export interface ProviderBudget {
  hourlyCap: number;
  dailyCap: number;
  monthlyBandwidthBytes: number;
  estimatedBytesPerBar: number;
  headroom: number; // 0..1 margin reserved for retries/bursts/skew
  floorSeconds: number; // hard safety floor; never fetch faster than this
}

export interface CadenceInputs {
  uniqueKeys: number; // N: unique enabled, in-session acquisition keys in the scope
  windowSeconds: number; // active session window length for the scope
  monthlyBarSeconds: number; // sum(bars/response * active seconds/day * active days/month)
  fastestRequestedSeconds: number; // min scanFrequency among the scope's watches
  budget: ProviderBudget;
}

/**
 * Target cadence from the budget formula (see spec). Whichever constraint binds
 * wins: with few symbols the user-requested cadence dominates (budget is slack);
 * as N grows the hourly/daily budget terms dominate and the whole scope slows
 * uniformly. Returns seconds.
 */
export function computeCadenceSeconds({
  uniqueKeys: N,
  windowSeconds,
  monthlyBarSeconds,
  fastestRequestedSeconds,
  budget,
}: CadenceInputs): number {
  const floor = Math.max(budget.floorSeconds, fastestRequestedSeconds || 0);
  if (N <= 0) return Math.max(floor, budget.floorSeconds);

  const usableHourly = Math.max(1, budget.hourlyCap * budget.headroom);
  const usableDaily = Math.max(1, budget.dailyCap * budget.headroom);
  const hourlyTerm = Math.ceil((N * 3600) / usableHourly);
  const dailyTerm = Math.ceil((N * windowSeconds) / usableDaily);
  const usableMonthlyBytes = Math.max(
    1,
    budget.monthlyBandwidthBytes * budget.headroom,
  );
  const bandwidthTerm = Math.ceil(
    (monthlyBarSeconds * budget.estimatedBytesPerBar) / usableMonthlyBytes,
  );

  return Math.max(
    budget.floorSeconds,
    fastestRequestedSeconds,
    hourlyTerm,
    dailyTerm,
    bandwidthTerm,
  );
}

/**
 * Measured guardrail: the sustainable cadence given how much of today's usable
 * daily budget has ALREADY been spent. As real usage rises the remaining budget
 * shrinks and cadence tightens; if the budget is exhausted, cap refreshes at one
 * per active window. The governor takes the max of this and the formula target.
 */
export function measuredCadenceSeconds({
  uniqueKeys: N,
  windowSeconds,
  usableDaily,
  usedToday,
  floorSeconds,
}: {
  uniqueKeys: number;
  windowSeconds: number;
  usableDaily: number;
  usedToday: number;
  floorSeconds: number;
}): number {
  if (N <= 0) return floorSeconds;
  const remaining = usableDaily - usedToday;
  if (remaining <= 0) return windowSeconds; // exhausted: at most one refresh per window
  return Math.max(floorSeconds, Math.ceil((N * windowSeconds) / remaining));
}

export interface GovernorDecision {
  providerScope: string;
  cadenceSeconds: number;
  uniqueKeys: number;
  headroomUtilization: number; // 0..1: fraction of usable daily budget projected in use
}

/**
 * Holds the current effective cadence per provider scope. Safety slowdowns apply
 * immediately; speed-ups use hysteresis so a coarse recompute does not oscillate
 * when N sits on a boundary. `set` reports whether the stored cadence changed.
 */
export class CadenceGovernor {
  private readonly cadence = new Map<string, number>();

  constructor(
    private readonly opts: {
      hysteresisRatio: number; // require at least this relative change to adjust
      defaultCadenceSeconds: number; // used before the first recompute for a scope
    },
  ) {}

  /** Effective cadence (seconds) for a scope; the default until first computed. */
  getCadenceSeconds(scope: string): number {
    return this.cadence.get(scope) ?? this.opts.defaultCadenceSeconds;
  }

  /** Update a scope's cadence, honoring hysteresis. Returns true if it changed. */
  set(scope: string, seconds: number): boolean {
    const current = this.cadence.get(scope);
    if (current !== undefined && current > 0) {
      // A larger cadence is a safety-required slowdown: apply it immediately so
      // hysteresis can never consume the configured provider headroom.
      if (seconds > current) {
        this.cadence.set(scope, seconds);
        return true;
      }
      const relativeChange = Math.abs(seconds - current) / current;
      if (relativeChange < this.opts.hysteresisRatio) return false;
    }
    this.cadence.set(scope, seconds);
    return true;
  }

  /** Current scopes with a computed cadence (for metrics/inspection). */
  scopes(): string[] {
    return [...this.cadence.keys()];
  }
}

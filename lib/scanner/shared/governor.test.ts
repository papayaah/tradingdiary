import { describe, it, expect } from 'vitest';
import {
  computeCadenceSeconds,
  measuredCadenceSeconds,
  CadenceGovernor,
  type ProviderBudget,
} from './governor';

// Spec reference budget: 10k/hr, 100k/day, 20% headroom, 15s floor, 12h window.
const BUDGET: ProviderBudget = {
  hourlyCap: 10_000,
  dailyCap: 100_000,
  monthlyBandwidthBytes: 40_000_000_000,
  estimatedBytesPerBar: 110,
  headroom: 0.8,
  floorSeconds: 15,
};
const WINDOW_12H = 12 * 3600;

describe('computeCadenceSeconds — budget formula (spec table)', () => {
  // fastestRequested tiny so the budget terms bind and we can check them directly.
  const at = (N: number) =>
    computeCadenceSeconds({
      uniqueKeys: N,
      windowSeconds: WINDOW_12H,
      monthlyBarSeconds: 0,
      fastestRequestedSeconds: 1,
      budget: BUDGET,
    });

  it('matches the documented cadence at each scale', () => {
    expect(at(50)).toBe(27); // daily term binds: ceil(50*43200/80000)
    expect(at(200)).toBe(108);
    expect(at(500)).toBe(270);
    expect(at(1000)).toBe(540);
  });

  it('lets the user-requested cadence dominate when the budget is slack', () => {
    // Few symbols, slow ask -> the ask wins.
    expect(
      computeCadenceSeconds({
        uniqueKeys: 10,
        windowSeconds: WINDOW_12H,
        monthlyBarSeconds: 0,
        fastestRequestedSeconds: 600,
        budget: BUDGET,
      }),
    ).toBe(600);
  });

  it('never returns below the floor', () => {
    expect(
      computeCadenceSeconds({ uniqueKeys: 1, windowSeconds: WINDOW_12H, monthlyBarSeconds: 0, fastestRequestedSeconds: 1, budget: BUDGET }),
    ).toBe(15);
  });

  it('returns the floor/ask when there are no keys', () => {
    expect(
      computeCadenceSeconds({ uniqueKeys: 0, windowSeconds: WINDOW_12H, monthlyBarSeconds: 0, fastestRequestedSeconds: 5, budget: BUDGET }),
    ).toBe(15);
  });
});

describe('computeCadenceSeconds — monthly bandwidth budget', () => {
  it('slows acquisition when estimated response bandwidth binds', () => {
    const monthlyBarSeconds = 300 * 96 * (16 * 3600) * 22;
    const cadence = computeCadenceSeconds({
      uniqueKeys: 300,
      windowSeconds: 16 * 3600,
      monthlyBarSeconds,
      fastestRequestedSeconds: 15,
      budget: BUDGET,
    });
    expect(cadence).toBe(216); // daily requests bind; bandwidth estimate is lower.
  });

  it('honors a tighter configured bandwidth budget', () => {
    const cadence = computeCadenceSeconds({
      uniqueKeys: 1,
      windowSeconds: 3600,
      monthlyBarSeconds: 1_000_000_000,
      fastestRequestedSeconds: 1,
      budget: { ...BUDGET, monthlyBandwidthBytes: 1_000_000 },
    });
    expect(cadence).toBe(137_500);
  });
});

describe('computeCadenceSeconds — adaptive Tiingo intraday scale', () => {
  const adaptive = (symbols: number) => computeCadenceSeconds({
    uniqueKeys: symbols,
    windowSeconds: 16 * 3600,
    monthlyBarSeconds: symbols * 96 * (16 * 3600) * 22,
    fastestRequestedSeconds: 15,
    budget: BUDGET,
  });

  it('refreshes small pools quickly and slows larger pools under 80% of quota', () => {
    expect(adaptive(10)).toBe(15);
    expect(adaptive(100)).toBe(72);
    expect(adaptive(300)).toBe(216);
    expect(adaptive(1000)).toBe(720);
  });
});

describe('measuredCadenceSeconds — guardrail from real usage', () => {
  const usableDaily = BUDGET.dailyCap * BUDGET.headroom; // 80,000

  it('with nothing spent, matches the formula daily term', () => {
    const m = measuredCadenceSeconds({ uniqueKeys: 500, windowSeconds: WINDOW_12H, usableDaily, usedToday: 0, floorSeconds: 15 });
    expect(m).toBe(270); // ceil(500*43200/80000)
  });

  it('tightens as usage rises toward the cap', () => {
    const light = measuredCadenceSeconds({ uniqueKeys: 500, windowSeconds: WINDOW_12H, usableDaily, usedToday: 0, floorSeconds: 15 });
    const heavy = measuredCadenceSeconds({ uniqueKeys: 500, windowSeconds: WINDOW_12H, usableDaily, usedToday: 60_000, floorSeconds: 15 });
    expect(heavy).toBeGreaterThan(light);
  });

  it('caps at one refresh per window when the budget is exhausted', () => {
    const m = measuredCadenceSeconds({ uniqueKeys: 500, windowSeconds: WINDOW_12H, usableDaily, usedToday: usableDaily, floorSeconds: 15 });
    expect(m).toBe(WINDOW_12H);
  });
});

describe('CadenceGovernor — hysteresis', () => {
  it('applies every slowdown but uses hysteresis for speed-ups', () => {
    const g = new CadenceGovernor({ hysteresisRatio: 0.2, defaultCadenceSeconds: 60 });
    expect(g.getCadenceSeconds('tiingo:server')).toBe(60); // default before first compute

    expect(g.set('tiingo:server', 100)).toBe(true);
    expect(g.getCadenceSeconds('tiingo:server')).toBe(100);

    expect(g.set('tiingo:server', 110)).toBe(true); // safety slowdown is immediate
    expect(g.getCadenceSeconds('tiingo:server')).toBe(110);

    expect(g.set('tiingo:server', 100)).toBe(false); // 9% speed-up is held
    expect(g.getCadenceSeconds('tiingo:server')).toBe(110);

    expect(g.set('tiingo:server', 80)).toBe(true); // 27% speed-up is adopted
    expect(g.getCadenceSeconds('tiingo:server')).toBe(80);
  });

  it('tracks scopes independently', () => {
    const g = new CadenceGovernor({ hysteresisRatio: 0.2, defaultCadenceSeconds: 60 });
    g.set('a:server', 200);
    g.set('b:server', 400);
    expect(g.getCadenceSeconds('a:server')).toBe(200);
    expect(g.getCadenceSeconds('b:server')).toBe(400);
    expect(g.scopes().sort()).toEqual(['a:server', 'b:server']);
  });
});

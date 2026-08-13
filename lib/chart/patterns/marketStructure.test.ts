import { describe, expect, it } from 'vitest';
import { CandleData } from './pivots';
import { detectMarketStructure } from './marketStructure';

function candlesFromCloses(closes: number[], lows?: Record<number, number>): CandleData[] {
  return closes.map((close, index) => ({
    time: 1_700_000_000 + index * 60,
    open: close - 0.2,
    high: close + 1,
    low: lows?.[index] ?? close - 1,
    close,
  }));
}

describe('viewport market structure', () => {
  it('finds wick-based horizontal support with repeated touches', () => {
    const closes = [105, 103, 101, 99, 97, 100, 103, 106, 104, 101, 98, 97, 100, 104, 107, 105, 102, 99, 97, 100, 104, 108, 106, 104, 103];
    const structure = detectMarketStructure(candlesFromCloses(closes, { 4: 95, 11: 95.1, 18: 94.9 }));

    const support = structure.levels.find((level) => level.type === 'support');
    expect(support?.touches).toBeGreaterThanOrEqual(2);
    expect(support?.price).toBeCloseTo(95, 0);
  });

  it('finds rising support and projects it to the viewport edge', () => {
    const closes = [108, 105, 102, 99, 97, 101, 106, 110, 107, 104, 101, 99, 103, 108, 112, 109, 106, 103, 101, 105, 110, 114, 112, 110, 109];
    const structure = detectMarketStructure(candlesFromCloses(closes, { 4: 95, 11: 97, 18: 99 }));

    const support = structure.trendlines.find((line) => line.type === 'rising-support');
    expect(support?.touches).toBeGreaterThanOrEqual(2);
    expect(support?.projectedPrice).toBeGreaterThan(support?.endPrice ?? Infinity);
  });
});

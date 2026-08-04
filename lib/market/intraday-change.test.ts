import { describe, expect, it } from 'vitest';
import {
  calculateCandleWindowChange,
  calculateEquityIntradayChange,
  calculateFuturesDailyChange,
  calculateWatchPriceChange,
  candleCountForHours,
} from './intraday-change';

describe('calculateFuturesDailyChange', () => {
  const daily = [
    { time: 1, close: 28500 }, // older
    { time: 2, close: 28891.75 }, // prior settlement (second-to-last)
    { time: 3, close: 29050 }, // today's in-progress bar (last)
  ];

  it('measures change from the prior daily close (settlement), not the in-progress bar', () => {
    const result = calculateFuturesDailyChange(daily, 29108.75);
    expect(result).not.toBeNull();
    expect(result!.amount).toBeCloseTo(217, 2); // 29108.75 - 28891.75
    expect(result!.percent).toBeCloseTo(0.751, 2);
  });

  it('returns null without at least two daily bars or a finite price', () => {
    expect(calculateFuturesDailyChange([{ time: 1, close: 100 }], 105)).toBeNull();
    expect(calculateFuturesDailyChange(daily, Number.NaN)).toBeNull();
  });

  it('returns null when the prior close is zero', () => {
    expect(calculateFuturesDailyChange([{ time: 1, close: 0 }, { time: 2, close: 0 }], 105)).toBeNull();
  });
});

describe('calculateEquityIntradayChange', () => {
  it('uses the prior regular-session close and ignores prior after-hours candles', () => {
    const result = calculateEquityIntradayChange([
      { time: Date.parse('2026-07-28T19:50:00Z') / 1000, close: 100 },
      { time: Date.parse('2026-07-28T20:30:00Z') / 1000, close: 102 },
      { time: Date.parse('2026-07-29T09:00:00Z') / 1000, close: 101 },
    ]);

    expect(result?.amount).toBe(1);
    expect(result?.percent).toBe(1);
  });

  it('returns a negative amount and percentage for a down session', () => {
    const result = calculateEquityIntradayChange([
      { time: Date.parse('2026-07-28T19:50:00Z') / 1000, close: 110 },
      { time: Date.parse('2026-07-29T14:00:00Z') / 1000, close: 99 },
    ]);

    expect(result?.amount).toBe(-11);
    expect(result?.percent).toBeCloseTo(-10);
  });

  it('returns null when the provider response does not contain a prior session', () => {
    expect(
      calculateEquityIntradayChange([
        { time: Date.parse('2026-07-29T14:00:00Z') / 1000, close: 99 },
      ]),
    ).toBeNull();
  });
});

describe('candle-window change', () => {
  it('calculates a signed move from the first open to the latest close', () => {
    expect(calculateCandleWindowChange([
      { time: 1, open: 100, close: 102 },
      { time: 2, open: 102, close: 105 },
    ])).toEqual({ amount: 5, percent: 5 });
  });

  it('sizes a four-hour window for the selected interval', () => {
    expect(candleCountForHours('10m')).toBe(24);
    expect(candleCountForHours('1h')).toBe(4);
  });

  it('uses the candle window for futures watch displays', () => {
    expect(calculateWatchPriceChange('NQ=F', '10m', [
      { time: 1, open: 100, close: 101 },
      { time: 2, open: 101, close: 98 },
    ])).toEqual({ amount: -2, percent: -2 });
  });
});

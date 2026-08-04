import { describe, expect, it } from 'vitest';
import {
  calculateCandleWindowChange,
  calculateEquityIntradayChange,
  calculateWatchPriceChange,
  candleCountForHours,
} from './intraday-change';

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

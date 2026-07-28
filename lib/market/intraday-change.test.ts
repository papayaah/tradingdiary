import { describe, expect, it } from 'vitest';
import { calculateEquityIntradayChange } from './intraday-change';

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

import { describe, expect, it } from 'vitest';
import {
  etWallClockToEpochSeconds,
  findExecutionCandleTime,
  getETOffsetSeconds,
} from './execution-time';

describe('execution chart time alignment', () => {
  it('uses the DST-aware New York offset', () => {
    expect(getETOffsetSeconds('20260624')).toBe(-4 * 60 * 60);
    expect(getETOffsetSeconds('20261224')).toBe(-5 * 60 * 60);
  });

  it('converts an ET execution time to the raw UTC candle epoch', () => {
    expect(etWallClockToEpochSeconds('20260624', '07:22:09'))
      .toBe(Date.UTC(2026, 5, 24, 11, 22, 9) / 1000);
  });

  it('places an execution in its containing candle rather than the next bar', () => {
    const candles = ['11:20', '11:30', '11:40'].map((time) => {
      const [hour, minute] = time.split(':').map(Number);
      return { time: Date.UTC(2026, 5, 24, hour, minute) / 1000 };
    });

    expect(findExecutionCandleTime(candles, '07:26:00', '20260624'))
      .toBe(Date.UTC(2026, 5, 24, 11, 20) / 1000);
    expect(findExecutionCandleTime(candles, '07:30:00', '20260624'))
      .toBe(Date.UTC(2026, 5, 24, 11, 30) / 1000);
  });
});

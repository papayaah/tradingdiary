import { describe, expect, it } from 'vitest';
import type { CandleData } from '@/lib/chart/patterns';
import { buildExtendedHoursRanges } from '@/components/chart/ExtendedHoursBackground';

const candle = (hourUtc: number, minuteUtc: number): CandleData => ({
  time: Date.UTC(2026, 5, 24, hourUtc, minuteUtc) / 1000,
  open: 1,
  high: 2,
  low: 0,
  close: 1,
});

describe('buildExtendedHoursRanges', () => {
  it('returns only pre-market and post-market candle ranges', () => {
    const ranges = buildExtendedHoursRanges([
      candle(8, 0),   // 4:00 AM ET
      candle(13, 25), // 9:25 AM ET
      candle(13, 30), // 9:30 AM ET, regular
      candle(19, 55), // 3:55 PM ET, regular
      candle(20, 0),  // 4:00 PM ET
      candle(23, 55), // 7:55 PM ET
    ], '20260624');

    expect(ranges).toEqual([
      { session: 'pre', startTime: candle(8, 0).time, endTime: candle(13, 25).time },
      { session: 'post', startTime: candle(20, 0).time, endTime: candle(23, 55).time },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { recentSampleDateShift, shiftSampleDate } from './sample-loader';

describe('rolling sample trade dates', () => {
  it('places the newest trade near today while preserving weekdays', () => {
    const dates = ['20260603', '20260708', '20260807'];
    const shift = recentSampleDateShift(dates, new Date(2026, 7, 14, 12));

    expect(shift).toBe(7);
    expect(dates.map((date) => shiftSampleDate(date, shift))).toEqual([
      '20260610',
      '20260715',
      '20260814',
    ]);
  });

  it('keeps the newest date at or before today when the source dates are ahead', () => {
    const shift = recentSampleDateShift(['20260821'], new Date(2026, 7, 14, 12));
    expect(shiftSampleDate('20260821', shift)).toBe('20260814');
  });
});

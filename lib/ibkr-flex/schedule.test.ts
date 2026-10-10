import { describe, expect, it } from 'vitest';
import { nextDailyFlexSync } from './schedule';

describe('nextDailyFlexSync', () => {
  it('schedules 2:10 PM Manila later the same day, including within the target hour', () => {
    expect(nextDailyFlexSync(new Date('2026-10-10T06:09:59.999Z')).toISOString())
      .toBe('2026-10-10T06:10:00.000Z');
  });

  it.each(['2026-10-10T06:10:00Z', '2026-10-10T10:00:00Z'])('moves to the next day at or after the target: %s', (now) => {
    expect(nextDailyFlexSync(new Date(now)).toISOString())
      .toBe('2026-10-11T06:10:00.000Z');
  });

  it.each(['2026-01-15', '2026-07-15'])('keeps the same UTC time regardless of US daylight saving time: %s', (day) => {
    expect(nextDailyFlexSync(new Date(`${day}T06:00:00Z`)).toISOString())
      .toBe(`${day}T06:10:00.000Z`);
  });

  it('uses the Manila calendar date when UTC is still on the previous day', () => {
    expect(nextDailyFlexSync(new Date('2026-10-09T23:00:00Z')).toISOString())
      .toBe('2026-10-10T06:10:00.000Z');
  });

  it('rolls across the year boundary', () => {
    expect(nextDailyFlexSync(new Date('2026-12-31T06:10:00Z')).toISOString())
      .toBe('2027-01-01T06:10:00.000Z');
  });
});

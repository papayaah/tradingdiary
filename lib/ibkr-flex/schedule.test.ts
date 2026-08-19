import { describe, expect, it } from 'vitest';
import { nextDailyFlexSync } from './schedule';

describe('nextDailyFlexSync', () => {
  it('schedules 6 AM Eastern later the same winter morning', () => {
    expect(nextDailyFlexSync(new Date('2026-01-15T10:00:00Z')).toISOString())
      .toBe('2026-01-15T11:00:00.000Z');
  });

  it('moves to the next day once the daily hour has passed', () => {
    expect(nextDailyFlexSync(new Date('2026-01-15T12:00:00Z')).toISOString())
      .toBe('2026-01-16T11:00:00.000Z');
  });

  it('accounts for Eastern daylight saving time', () => {
    expect(nextDailyFlexSync(new Date('2026-07-15T09:00:00Z')).toISOString())
      .toBe('2026-07-15T10:00:00.000Z');
  });
});

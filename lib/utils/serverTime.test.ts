import { describe, it, expect } from 'vitest';
import { parseServerTimestampMs } from './serverTime';

describe('parseServerTimestampMs', () => {
  it('parses a UTC-naive server timestamp as UTC (not local)', () => {
    // The scanner returns tz-less strings; they must be read as UTC regardless
    // of the viewer's timezone, else countdowns show a constant offset.
    const expected = Date.UTC(2026, 7, 6, 8, 1, 36, 568);
    expect(parseServerTimestampMs('2026-08-06 08:01:36.568')).toBe(expected);
  });

  it('handles the ISO "T" form without a zone as UTC too', () => {
    expect(parseServerTimestampMs('2026-08-06T08:01:36.568')).toBe(
      Date.UTC(2026, 7, 6, 8, 1, 36, 568),
    );
  });

  it('respects an explicit Z / offset when present', () => {
    expect(parseServerTimestampMs('2026-08-06T08:01:36.568Z')).toBe(
      Date.UTC(2026, 7, 6, 8, 1, 36, 568),
    );
    expect(parseServerTimestampMs('2026-08-06T08:01:36+08:00')).toBe(
      Date.UTC(2026, 7, 6, 0, 1, 36),
    );
  });

  it('returns NaN for empty input', () => {
    expect(Number.isNaN(parseServerTimestampMs(null))).toBe(true);
    expect(Number.isNaN(parseServerTimestampMs(''))).toBe(true);
  });
});

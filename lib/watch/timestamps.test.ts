import { describe, expect, it } from 'vitest';
import { scannerTimestampToUtcIso } from './timestamps';

describe('scannerTimestampToUtcIso', () => {
  it('treats a timezone-less PostgreSQL scanner timestamp as UTC', () => {
    expect(scannerTimestampToUtcIso('2026-07-30 16:18:21.300437')).toBe(
      '2026-07-30T16:18:21.300Z',
    );
  });

  it('preserves the instant represented by an explicit timezone', () => {
    expect(scannerTimestampToUtcIso('2026-07-31T00:18:21.300+08:00')).toBe(
      '2026-07-30T16:18:21.300Z',
    );
  });

  it('leaves invalid and absent values unchanged', () => {
    expect(scannerTimestampToUtcIso('not-a-date')).toBe('not-a-date');
    expect(scannerTimestampToUtcIso(null)).toBeNull();
    expect(scannerTimestampToUtcIso(undefined)).toBeUndefined();
  });
});

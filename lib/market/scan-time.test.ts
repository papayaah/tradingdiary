import { describe, expect, it } from 'vitest';
import { formatScanTimeEt } from './scan-time';

describe('formatScanTimeEt', () => {
  it('shows scanner timestamps in Eastern Time', () => {
    expect(formatScanTimeEt('2026-08-27T10:31:00.000Z')).toBe('6:31 AM EDT');
  });

  it('treats zone-less PostgreSQL scanner timestamps as UTC', () => {
    expect(formatScanTimeEt('2026-08-27 10:31:00.000')).toBe('6:31 AM EDT');
  });
});

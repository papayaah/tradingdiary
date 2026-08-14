import { describe, expect, it } from 'vitest';
import { parseScannerControl } from './control';

describe('scanner global control', () => {
  it('defaults to running when no control exists', () => {
    expect(parseScannerControl(null)).toEqual({ paused: false, changedAt: null, changedBy: null });
  });

  it('restores a persisted pause across process restarts', () => {
    expect(parseScannerControl(JSON.stringify({
      paused: true,
      changedAt: '2026-08-14T00:00:00.000Z',
      changedBy: 'admin@example.com',
    }))).toEqual({
      paused: true,
      changedAt: '2026-08-14T00:00:00.000Z',
      changedBy: 'admin@example.com',
    });
  });
});

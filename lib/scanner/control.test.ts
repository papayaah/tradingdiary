import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseScannerControl } from './control';

describe('scanner global control', () => {
  beforeEach(() => {
    vi.stubEnv('EQUITIES_PROVIDER', 'auto');
  });
  it('defaults to running when no control exists', () => {
    expect(parseScannerControl(null)).toEqual({
      paused: false,
      equitiesProvider: 'auto',
      changedAt: null,
      changedBy: null,
    });
  });

  it('restores a persisted pause across process restarts', () => {
    expect(parseScannerControl(JSON.stringify({
      paused: true,
      changedAt: '2026-08-14T00:00:00.000Z',
      changedBy: 'admin@example.com',
    }))).toEqual({
      paused: true,
      equitiesProvider: 'auto',
      changedAt: '2026-08-14T00:00:00.000Z',
      changedBy: 'admin@example.com',
    });
  });

  it('restores the centralized equities provider', () => {
    expect(parseScannerControl(JSON.stringify({
      paused: false,
      equitiesProvider: 'ibkr',
    })).equitiesProvider).toBe('ibkr');
  });
});

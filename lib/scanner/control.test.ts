import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseScannerControl, pausedClassSet } from './control';

describe('scanner global control', () => {
  beforeEach(() => {
    vi.stubEnv('EQUITIES_PROVIDER', 'auto');
  });

  it('defaults to running with auto providers and no class paused', () => {
    expect(parseScannerControl(null)).toEqual({
      paused: false,
      providers: { equity: 'auto', crypto: 'auto', futures: 'auto' },
      pausedClasses: { equity: false, crypto: false, futures: false },
      cadenceOverrides: {},
      changedAt: null,
      changedBy: null,
    });
  });

  it('restores a persisted global pause across process restarts', () => {
    const state = parseScannerControl(JSON.stringify({
      paused: true,
      changedAt: '2026-08-14T00:00:00.000Z',
      changedBy: 'admin@example.com',
    }));
    expect(state.paused).toBe(true);
    expect(state.changedAt).toBe('2026-08-14T00:00:00.000Z');
    expect(state.changedBy).toBe('admin@example.com');
  });

  it('restores per-class provider selections', () => {
    const state = parseScannerControl(JSON.stringify({
      providers: { equity: 'ibkr', crypto: 'yahoo', futures: 'ibkr' },
    }));
    expect(state.providers).toEqual({ equity: 'ibkr', crypto: 'yahoo', futures: 'ibkr' });
  });

  it('rejects providers not valid for a class (e.g. Tiingo futures) and falls back to auto', () => {
    const state = parseScannerControl(JSON.stringify({
      providers: { equity: 'polygon', crypto: 'polygon', futures: 'tiingo' },
    }));
    // polygon is valid for equity, but not for crypto; tiingo is not a futures provider.
    expect(state.providers).toEqual({ equity: 'polygon', crypto: 'auto', futures: 'auto' });
  });

  it('seeds equity from the legacy top-level equitiesProvider field', () => {
    const state = parseScannerControl(JSON.stringify({
      paused: false,
      equitiesProvider: 'ibkr',
    }));
    expect(state.providers.equity).toBe('ibkr');
    expect(state.providers.crypto).toBe('auto');
    expect(state.providers.futures).toBe('auto');
  });

  it('restores per-class pause flags', () => {
    const state = parseScannerControl(JSON.stringify({
      pausedClasses: { crypto: true },
    }));
    expect(state.pausedClasses).toEqual({ equity: false, crypto: true, futures: false });
    expect(pausedClassSet(state)).toEqual(new Set(['crypto']));
  });
});

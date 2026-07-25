import { describe, it, expect } from 'vitest';
import { isSessionActive } from './sessions';

// Fixed instants (UTC) mapped to known ET wall-clock times.
// 2026-01-05 is a Monday in EST (UTC-5); 2026-07-06 is a Monday in EDT (UTC-4).
const estMonday = (etHour: number, etMin = 0) =>
  new Date(Date.UTC(2026, 0, 5, etHour + 5, etMin)); // EST offset +5
const edtMonday = (etHour: number, etMin = 0) =>
  new Date(Date.UTC(2026, 6, 6, etHour + 4, etMin)); // EDT offset +4
const estSaturday = (etHour: number) => new Date(Date.UTC(2026, 0, 3, etHour + 5));

describe('isSessionActive — session "all"', () => {
  it('is always active regardless of time or asset class', () => {
    expect(isSessionActive('all', 'equity', estSaturday(3))).toBe(true);
    expect(isSessionActive('all', 'crypto', estMonday(2))).toBe(true);
  });
});

describe('isSessionActive — equity RTH boundaries (EST)', () => {
  it('is closed just before 09:30 and open at 09:30', () => {
    expect(isSessionActive('rth', 'equity', estMonday(9, 29))).toBe(false);
    expect(isSessionActive('rth', 'equity', estMonday(9, 30))).toBe(true);
  });
  it('is open at 15:59 and closed at 16:00', () => {
    expect(isSessionActive('rth', 'equity', estMonday(15, 59))).toBe(true);
    expect(isSessionActive('rth', 'equity', estMonday(16, 0))).toBe(false);
  });
});

describe('isSessionActive — DST correctness (EDT)', () => {
  it('open at 09:30 ET in July (EDT, UTC-4)', () => {
    expect(isSessionActive('rth', 'equity', edtMonday(9, 30))).toBe(true);
    expect(isSessionActive('rth', 'equity', edtMonday(9, 29))).toBe(false);
  });
});

describe('isSessionActive — pre / ext windows', () => {
  it('pre-market is 04:00–09:30', () => {
    expect(isSessionActive('pre', 'equity', estMonday(3, 59))).toBe(false);
    expect(isSessionActive('pre', 'equity', estMonday(4, 0))).toBe(true);
    expect(isSessionActive('pre', 'equity', estMonday(9, 30))).toBe(false);
  });
  it('extended runs to 20:00', () => {
    expect(isSessionActive('ext', 'equity', estMonday(19, 59))).toBe(true);
    expect(isSessionActive('ext', 'equity', estMonday(20, 0))).toBe(false);
  });
});

describe('isSessionActive — weekends and non-equity', () => {
  it('equity RTH is closed on Saturday', () => {
    expect(isSessionActive('rth', 'equity', estSaturday(11))).toBe(false);
  });
  it('futures/crypto ignore equity session windows for now', () => {
    expect(isSessionActive('rth', 'futures', estSaturday(11))).toBe(true);
    expect(isSessionActive('pre', 'crypto', estMonday(2))).toBe(true);
  });
});

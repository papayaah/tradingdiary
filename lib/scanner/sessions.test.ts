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
  it('uses the full equity intraday window but keeps continuous assets active', () => {
    expect(isSessionActive('all', 'equity', estSaturday(11))).toBe(false);
    expect(isSessionActive('all', 'equity', estMonday(3, 59))).toBe(false);
    expect(isSessionActive('all', 'equity', estMonday(4))).toBe(true);
    expect(isSessionActive('all', 'equity', estMonday(19, 59))).toBe(true);
    expect(isSessionActive('all', 'equity', estMonday(20))).toBe(false);
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
    expect(isSessionActive('pre', 'equity', estMonday(9, 30))).toBe(true);
    expect(isSessionActive('pre', 'equity', estMonday(15, 59))).toBe(true);
    expect(isSessionActive('pre', 'equity', estMonday(16, 0))).toBe(false);
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
  it('crypto is 24/7 active', () => {
    expect(isSessionActive('pre', 'crypto', estMonday(2))).toBe(true);
    expect(isSessionActive('all', 'crypto', estSaturday(11))).toBe(true);
  });
  it('futures enforces Globex session hours (closed Sat, Sun AM, Fri after 5pm ET, Mon-Thu 5-6pm ET)', () => {
    // Saturday: closed
    expect(isSessionActive('all', 'futures', estSaturday(11))).toBe(false);
    // Sunday 10am ET: closed
    expect(isSessionActive('all', 'futures', new Date(Date.UTC(2026, 0, 4, 15, 0)))).toBe(false); // Sun Jan 4 10am ET (+5)
    // Sunday 6:01pm ET: open
    expect(isSessionActive('all', 'futures', new Date(Date.UTC(2026, 0, 4, 23, 1)))).toBe(true); // Sun Jan 4 6:01pm ET (+5)
    // Monday 2pm ET: open
    expect(isSessionActive('all', 'futures', estMonday(14, 0))).toBe(true);
    // Monday 5:30pm ET maintenance halt: closed
    expect(isSessionActive('all', 'futures', estMonday(17, 30))).toBe(false);
    // Friday 5:30pm ET post-market: closed for weekend
    expect(isSessionActive('all', 'futures', new Date(Date.UTC(2026, 0, 9, 22, 30)))).toBe(false); // Fri Jan 9 5:30pm ET (+5)
  });
});

import { describe, expect, it } from 'vitest';
import { riskPerShare, plannedRMultiple, realizedRMultiple } from './trade-plan';

describe('riskPerShare', () => {
  it('long risk is entry minus stop', () => {
    expect(riskPerShare('LONG', 100, 95)).toBe(5);
  });
  it('short risk is stop minus entry', () => {
    expect(riskPerShare('SHORT', 100, 105)).toBe(5);
  });
  it('rejects a stop on the wrong side (no invented risk)', () => {
    expect(riskPerShare('LONG', 100, 105)).toBeNull();
    expect(riskPerShare('SHORT', 100, 95)).toBeNull();
  });
});

describe('plannedRMultiple', () => {
  it('computes reward-to-risk for a long plan', () => {
    // risk 5 (100->95), reward 10 (100->110) => 2R
    expect(plannedRMultiple('LONG', 100, 95, 110)).toBeCloseTo(2);
  });
  it('computes reward-to-risk for a short plan', () => {
    // risk 5 (100->105), reward 10 (100->90) => 2R
    expect(plannedRMultiple('SHORT', 100, 105, 90)).toBeCloseTo(2);
  });
  it('is null when any input is missing', () => {
    expect(plannedRMultiple('LONG', 100, undefined, 110)).toBeNull();
  });
});

describe('realizedRMultiple', () => {
  it('measures the actual outcome in units of initial risk (long)', () => {
    // risk 5 (100->95), actual move +9 (100->109) => 1.8R
    expect(realizedRMultiple('LONG', 100, 109, 95)).toBeCloseTo(1.8);
  });
  it('is negative on a loss', () => {
    // risk 5, moved -5 to the stop => -1R
    expect(realizedRMultiple('LONG', 100, 95, 95)).toBeCloseTo(-1);
  });
  it('handles shorts', () => {
    // risk 5 (100->105), actual move +5 (100->95) => 1R
    expect(realizedRMultiple('SHORT', 100, 95, 105)).toBeCloseTo(1);
  });
  it('is null without an exit or stop', () => {
    expect(realizedRMultiple('LONG', 100, undefined, 95)).toBeNull();
    expect(realizedRMultiple('LONG', 100, 109, undefined)).toBeNull();
  });
});

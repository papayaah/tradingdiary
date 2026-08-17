import { describe, expect, it } from 'vitest';
import type { CashFlowRecord } from '@/lib/db/schema';
import {
  signedAmount,
  summarizeCashFlows,
  computeAccountEquity,
  computeEquityCurve,
} from './cash-flows';

let seq = 0;
function cf(overrides: Partial<CashFlowRecord>): CashFlowRecord {
  return {
    id: `cf${seq++}`,
    accountId: 'acct-1',
    date: '20260810',
    type: 'deposit',
    amount: 10000,
    currency: 'USD',
    updatedAt: 1,
    ...overrides,
  };
}

describe('cash flows', () => {
  it('applies conventional signs to a magnitude', () => {
    expect(signedAmount('deposit', 100)).toBe(100);
    expect(signedAmount('withdrawal', 100)).toBe(-100);
    expect(signedAmount('fee', 5)).toBe(-5);
    expect(signedAmount('interest', 2)).toBe(2);
    expect(signedAmount('adjustment', -30)).toBe(-30); // caller sign preserved
  });

  it('separates contributions from non-trading income', () => {
    const s = summarizeCashFlows([
      cf({ type: 'deposit', amount: 10000 }),
      cf({ type: 'withdrawal', amount: -2000 }),
      cf({ type: 'interest', amount: 15 }),
      cf({ type: 'fee', amount: -10 }),
    ]);
    expect(s.contributions).toBe(8000); // 10000 - 2000
    expect(s.nonTradingIncome).toBe(5); // 15 - 10
    expect(s.net).toBe(8005);
  });

  it('computes equity and an honest trading return', () => {
    const eq = computeAccountEquity(
      10000,
      [cf({ type: 'deposit', amount: 5000 }), cf({ type: 'dividend', amount: 20 })],
      750, // trading P&L
    );
    // capital base = 10000 + 5000 (dividend is not a contribution)
    expect(eq.capitalBase).toBe(15000);
    // equity = 10000 + 5000 + 20 + 750
    expect(eq.equity).toBe(15770);
    expect(eq.tradingReturnPct).toBeCloseTo((750 / 15000) * 100);
  });

  it('never divides by a zero capital base', () => {
    const eq = computeAccountEquity(undefined, [], 500);
    expect(eq.capitalBase).toBe(0);
    expect(eq.tradingReturnPct).toBeNull(); // not a misleading percentage
    expect(eq.equity).toBe(500);
  });

  it('a deposit changes equity but not trading P&L or return', () => {
    const before = computeAccountEquity(10000, [], 300);
    const after = computeAccountEquity(10000, [cf({ type: 'deposit', amount: 5000 })], 300);
    expect(after.equity - before.equity).toBe(5000); // equity up by the deposit
    expect(after.tradingPnL).toBe(before.tradingPnL); // trading P&L unchanged
  });

  it('builds an equity curve in date order from cash flows + daily P&L', () => {
    const curve = computeEquityCurve(
      10000,
      [cf({ type: 'deposit', amount: 2000, date: '20260812' })],
      new Map([
        ['20260810', 500],
        ['20260812', -100],
      ]),
    );
    expect(curve).toEqual([
      { date: '20260810', equity: 10500 }, // +500 P&L
      { date: '20260812', equity: 12400 }, // +2000 deposit, -100 P&L
    ]);
  });
});

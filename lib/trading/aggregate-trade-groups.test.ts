import { describe, expect, it } from 'vitest';
import type { TransactionRecord } from '@/lib/db/schema';
import { aggregateTradeGroupsByDay, aggregateByDay } from './aggregator';

let seq = 0;
function tx(overrides: Partial<TransactionRecord>): TransactionRecord {
  const base: TransactionRecord = {
    tradeId: `t${seq++}`,
    accountId: 'acct-1',
    symbol: 'AAPL',
    companyName: 'Apple',
    exchanges: 'NASDAQ',
    side: 'BUYTOOPEN',
    orderType: 'MKT',
    date: '20260813',
    time: '09:30:00',
    currency: 'USD',
    quantity: 100,
    multiplier: 1,
    price: 100,
    totalValue: 10000,
    commission: 0,
    feeMultiplier: 1,
    ...overrides,
  };
  if (overrides.totalValue === undefined) {
    base.totalValue = Math.abs(base.quantity) * Math.abs(base.price) * base.multiplier;
  }
  return base;
}

describe('aggregateTradeGroupsByDay', () => {
  const fixture: TransactionRecord[] = [
    // RT1 long, 09:30 -> 09:45
    tx({ side: 'BUYTOOPEN', time: '09:30:00', quantity: 100, price: 100 }),
    tx({ side: 'SELLTOCLOSE', time: '09:45:00', quantity: 100, price: 105 }),
    // RT2 short, 10:15 -> 10:30
    tx({ side: 'SELLTOOPEN', time: '10:15:00', quantity: 100, price: 110 }),
    tx({ side: 'BUYTOCLOSE', time: '10:30:00', quantity: 100, price: 108 }),
    // RT3 long, 13:30 -> 13:45
    tx({ side: 'BUYTOOPEN', time: '13:30:00', quantity: 50, price: 112 }),
    tx({ side: 'SELLTOCLOSE', time: '13:45:00', quantity: 50, price: 120 }),
  ];

  it('shows three same-day round trips as three separate trades, timeline-ordered', () => {
    const [day] = aggregateTradeGroupsByDay(fixture);
    expect(day.trades).toHaveLength(3);
    expect(day.trades.map((t) => t.firstTradeTime)).toEqual(['09:30:00', '10:15:00', '13:30:00']);
    expect(day.trades.map((t) => t.side)).toEqual(['LONG', 'SHORT', 'LONG']);
    // Each trade carries a unique group key.
    const keys = new Set(day.trades.map((t) => t.groupKey));
    expect(keys.size).toBe(3);
  });

  it('day P&L total reconciles with the legacy day+symbol aggregation', () => {
    const [flat] = aggregateTradeGroupsByDay(fixture);
    const [legacy] = aggregateByDay(fixture);
    expect(flat.netPnL).toBeCloseTo(legacy.netPnL);
    // But the legacy view merged them into a single row.
    expect(legacy.trades).toHaveLength(1);
  });

  it('counts wins and losses per round trip', () => {
    const [day] = aggregateTradeGroupsByDay(fixture);
    // RT1 +500, RT2 +200, RT3 +400 → all wins.
    expect(day.winCount).toBe(3);
    expect(day.lossCount).toBe(0);
  });
});

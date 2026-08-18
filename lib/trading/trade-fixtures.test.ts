import { describe, expect, it } from 'vitest';
import type { TransactionRecord } from '@/lib/db/schema';
import { splitIntoTradeGroups } from './trade-groups';
import { toTransactionRecords } from '@/lib/import/converter';
import type { NormalizedTransaction } from '@/lib/import/types';

// End-to-end fixture matrix for flat-to-flat identity across the trickier real
// shapes: scale in/out, break-even averaging, partial fills, futures multipliers,
// partially-open positions, and duplicate imports. Complements the scenario
// coverage in trade-groups.test.ts.

let seq = 0;
function tx(overrides: Partial<TransactionRecord>): TransactionRecord {
  return {
    tradeId: `f${seq++}`,
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
    totalValue: 0,
    commission: 0,
    feeMultiplier: 1,
    ...overrides,
  };
}

describe('fixtures — scale in/out and averaging', () => {
  it('average down then exit at the blended average is one break-even trade', () => {
    // The user pattern: buy, price drops, buy again to lower the average, then
    // sell the whole position back at that average — one round trip, ~$0 P&L.
    const groups = splitIntoTradeGroups([
      tx({ side: 'BUYTOOPEN', time: '09:30:00', quantity: 100, price: 50 }),
      tx({ side: 'BUYTOOPEN', time: '09:45:00', quantity: 100, price: 40 }),
      tx({ side: 'SELLTOCLOSE', time: '10:30:00', quantity: 200, price: 45 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entryAvgPrice).toBeCloseTo(45); // blended cost basis
    expect(groups[0].exitAvgPrice).toBeCloseTo(45);
    expect(groups[0].maxPosition).toBe(200);
    expect(groups[0].nativeGrossPnL).toBeCloseTo(0); // break-even
    expect(groups[0].isOpen).toBe(false);
  });

  it('short scale-in covered at the blended average is break-even', () => {
    const groups = splitIntoTradeGroups([
      tx({ side: 'SELLTOOPEN', time: '09:30:00', quantity: 100, price: 50 }),
      tx({ side: 'SELLTOOPEN', time: '09:45:00', quantity: 100, price: 60 }),
      tx({ side: 'BUYTOCLOSE', time: '10:30:00', quantity: 200, price: 55 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].side).toBe('SHORT');
    expect(groups[0].entryAvgPrice).toBeCloseTo(55);
    expect(groups[0].nativeGrossPnL).toBeCloseTo(0);
  });

  it('scale-in then partial scale-out leaves the remainder open with realized P&L', () => {
    const groups = splitIntoTradeGroups([
      tx({ side: 'BUYTOOPEN', time: '09:30:00', quantity: 100, price: 10 }),
      tx({ side: 'BUYTOOPEN', time: '09:40:00', quantity: 100, price: 12 }),
      tx({ side: 'SELLTOCLOSE', time: '10:00:00', quantity: 150, price: 15 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].isOpen).toBe(true);
    expect(groups[0].netQuantity).toBe(50); // 50 shares still held
    expect(groups[0].openAvgCost).toBeCloseTo(12); // FIFO leaves the $12 lot
    // FIFO realized: 100@10 -> (15-10)*100=500; 50@12 -> (15-12)*50=150.
    expect(groups[0].nativeGrossPnL).toBeCloseTo(650);
  });
});

describe('fixtures — partial fills', () => {
  it('an entry and exit each filled in several partials is one clean trade', () => {
    const groups = splitIntoTradeGroups([
      tx({ side: 'BUYTOOPEN', time: '09:30:00', quantity: 50, price: 10 }),
      tx({ side: 'BUYTOOPEN', time: '09:30:01', quantity: 30, price: 10 }),
      tx({ side: 'BUYTOOPEN', time: '09:30:02', quantity: 20, price: 10 }),
      tx({ side: 'SELLTOCLOSE', time: '10:00:00', quantity: 60, price: 11 }),
      tx({ side: 'SELLTOCLOSE', time: '10:00:01', quantity: 40, price: 11 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].executions).toBe(5);
    expect(groups[0].maxPosition).toBe(100);
    expect(groups[0].entryAvgPrice).toBeCloseTo(10);
    expect(groups[0].exitAvgPrice).toBeCloseTo(11);
    expect(groups[0].nativeGrossPnL).toBeCloseTo(100); // (11-10)*100
  });
});

describe('fixtures — futures multipliers', () => {
  it('applies the contract multiplier to P&L', () => {
    const groups = splitIntoTradeGroups([
      tx({ symbol: 'ESZ6', side: 'BUYTOOPEN', quantity: 1, price: 5000, multiplier: 50 }),
      tx({ symbol: 'ESZ6', side: 'SELLTOCLOSE', quantity: 1, price: 5010, multiplier: 50, time: '10:00:00' }),
    ]);
    expect(groups).toHaveLength(1);
    // (5010 - 5000) * 1 contract * 50 multiplier
    expect(groups[0].nativeGrossPnL).toBeCloseTo(500);
  });

  it('applies the multiplier across a scaled-in futures position (FIFO)', () => {
    const groups = splitIntoTradeGroups([
      tx({ symbol: 'ESZ6', side: 'BUYTOOPEN', quantity: 1, price: 5000, multiplier: 20 }),
      tx({ symbol: 'ESZ6', side: 'BUYTOOPEN', quantity: 1, price: 5020, multiplier: 20, time: '09:40:00' }),
      tx({ symbol: 'ESZ6', side: 'SELLTOCLOSE', quantity: 2, price: 5030, multiplier: 20, time: '10:00:00' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entryAvgPrice).toBeCloseTo(5010);
    // 1@5000 -> (5030-5000)*20=600; 1@5020 -> (5030-5020)*20=200.
    expect(groups[0].nativeGrossPnL).toBeCloseTo(800);
  });
});

describe('fixtures — commissions reduce net P&L', () => {
  it('subtracts commissions (stored negative) from gross', () => {
    const groups = splitIntoTradeGroups([
      tx({ side: 'BUYTOOPEN', quantity: 100, price: 100, commission: -1 }),
      tx({ side: 'SELLTOCLOSE', quantity: 100, price: 105, commission: -1, time: '10:00:00' }),
    ]);
    expect(groups[0].nativeGrossPnL).toBeCloseTo(500);
    expect(groups[0].nativeNetPnL).toBeCloseTo(498);
  });
});

describe('fixtures — duplicate imports', () => {
  const norm = (over: Partial<NormalizedTransaction>): NormalizedTransaction => ({
    date: '2026-08-13',
    time: '09:30:00',
    symbol: 'AAPL',
    side: 'BUY',
    quantity: 100,
    price: 50,
    ...over,
  });

  it('re-importing the same executions yields identical ids and dedupes to nothing', () => {
    const source = [
      norm({ side: 'BUY', time: '09:30:00', orderId: 'o1' }),
      norm({ side: 'SELL', time: '10:00:00', orderId: 'o2' }),
      norm({ side: 'BUY', time: '11:00:00' }), // no order id — still deterministic
    ];
    const first = toTransactionRecords(source, 'acct-1', 'USD');
    const second = toTransactionRecords(source, 'acct-1', 'USD');

    const existing = new Set(first.map((t) => t.tradeId));
    const fresh = second.filter((t) => !existing.has(t.tradeId));
    expect(fresh).toHaveLength(0); // the import-time dedup drops the whole re-import
  });
});

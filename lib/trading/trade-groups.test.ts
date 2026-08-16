import { describe, expect, it } from 'vitest';
import type { TransactionRecord } from '@/lib/db/schema';
import { splitIntoTradeGroups } from './trade-groups';
import { aggregateByDay } from './aggregator';

let seq = 0;
function tx(overrides: Partial<TransactionRecord>): TransactionRecord {
  return {
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
}

describe('flat-to-flat trade groups', () => {
  it('splits three same-day round trips in one symbol into three trades', () => {
    const groups = splitIntoTradeGroups([
      // RT1: long, scaled in, closed. +$?
      tx({ side: 'BUYTOOPEN', time: '09:30:00', quantity: 100, price: 100 }),
      tx({ side: 'BUYTOOPEN', time: '09:31:00', quantity: 100, price: 102 }),
      tx({ side: 'SELLTOCLOSE', time: '09:45:00', quantity: 200, price: 105 }),
      // RT2: short, covered.
      tx({ side: 'SELLTOOPEN', time: '10:15:00', quantity: 100, price: 110 }),
      tx({ side: 'BUYTOCLOSE', time: '10:30:00', quantity: 100, price: 108 }),
      // RT3: long, closed.
      tx({ side: 'BUYTOOPEN', time: '13:30:00', quantity: 50, price: 112 }),
      tx({ side: 'SELLTOCLOSE', time: '13:45:00', quantity: 50, price: 120 }),
    ]);

    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.side)).toEqual(['LONG', 'SHORT', 'LONG']);
    expect(groups.every((g) => !g.isOpen)).toBe(true);

    // RT1: (105-100)*100 + (105-102)*100 = 500 + 300 = 800
    expect(groups[0].nativeGrossPnL).toBeCloseTo(800);
    expect(groups[0].openedTime).toBe('09:30:00');
    expect(groups[0].closedTime).toBe('09:45:00');
    expect(groups[0].entryAvgPrice).toBeCloseTo(101); // (100+102)/2
    expect(groups[0].exitAvgPrice).toBeCloseTo(105);
    // RT2 short: (110-108)*100 = 200
    expect(groups[1].nativeGrossPnL).toBeCloseTo(200);
    // RT3: (120-112)*50 = 400
    expect(groups[2].nativeGrossPnL).toBeCloseTo(400);
  });

  it('keeps a single scale-in/scale-out position as one trade', () => {
    const groups = splitIntoTradeGroups([
      tx({ side: 'BUYTOOPEN', time: '09:30:00', quantity: 100, price: 100 }),
      tx({ side: 'BUYTOOPEN', time: '09:31:00', quantity: 200, price: 101 }),
      tx({ side: 'SELLTOCLOSE', time: '09:40:00', quantity: 100, price: 103 }),
      tx({ side: 'SELLTOCLOSE', time: '09:50:00', quantity: 200, price: 104 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].maxPosition).toBe(300);
    expect(groups[0].executions).toBe(4);
    expect(groups[0].isOpen).toBe(false);
    // FIFO: sell100@103 vs buy100@100 = 300; sell200@104 vs buy200@101 = 600.
    expect(groups[0].nativeGrossPnL).toBeCloseTo(900);
  });

  it('splits a reversal at the zero crossing into two opposite trades', () => {
    // Long 100 @100, then sell 300 @110 → closes 100 (long) and opens short 200,
    // then buy 200 @108 to cover.
    const groups = splitIntoTradeGroups([
      tx({ side: 'BUYTOOPEN', time: '09:30:00', quantity: 100, price: 100 }),
      tx({ side: 'SELLTOCLOSE', time: '09:40:00', quantity: 300, price: 110 }),
      tx({ side: 'BUYTOCLOSE', time: '09:50:00', quantity: 200, price: 108 }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].side).toBe('LONG');
    expect(groups[1].side).toBe('SHORT');

    // Group 1 long: (110-100)*100 = 1000
    expect(groups[0].nativeGrossPnL).toBeCloseTo(1000);
    expect(groups[0].isOpen).toBe(false);
    // Group 2 short: (110-108)*200 = 400
    expect(groups[1].nativeGrossPnL).toBeCloseTo(400);
    expect(groups[1].isOpen).toBe(false);

    // Combined P&L equals FIFO over the raw fills: sell 300@110 vs buy 100@100
    // (=1000) then short 200 covered at 108 (=400) → 1400.
    const total = groups.reduce((s, g) => s + g.nativeGrossPnL, 0);
    expect(total).toBeCloseTo(1400);

    // The crossing fill is referenced by both groups with split quantities.
    const crossing = groups.flatMap((g) => g.legs).filter((l) => l.transaction.time === '09:40:00');
    expect(crossing).toHaveLength(2);
    expect(crossing.reduce((s, l) => s + l.quantity, 0)).toBeCloseTo(300);
  });

  it('treats an overnight hold as one open trade attributed to its opening day', () => {
    const groups = splitIntoTradeGroups([
      tx({ side: 'BUYTOOPEN', date: '20260813', time: '15:30:00', quantity: 100, price: 100 }),
      tx({ side: 'SELLTOCLOSE', date: '20260814', time: '09:45:00', quantity: 100, price: 105 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].tradingDay).toBe('20260813'); // opening day
    expect(groups[0].openedDate).toBe('20260813');
    expect(groups[0].closedDate).toBe('20260814');
    expect(groups[0].isOpen).toBe(false);
    expect(groups[0].nativeGrossPnL).toBeCloseTo(500);
  });

  it('leaves a position still open at end of data as an open trade', () => {
    const groups = splitIntoTradeGroups([
      tx({ side: 'BUYTOOPEN', quantity: 100, price: 100 }),
      tx({ side: 'SELLTOCLOSE', quantity: 40, price: 105, time: '10:00:00' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].isOpen).toBe(true);
    expect(groups[0].netQuantity).toBe(60);
    expect(groups[0].openAvgCost).toBeCloseTo(100);
    expect(groups[0].closedTime).toBeUndefined();
    // Realized on the 40 sold: (105-100)*40 = 200.
    expect(groups[0].nativeGrossPnL).toBeCloseTo(200);
  });

  it('separates the same symbol across different accounts', () => {
    const groups = splitIntoTradeGroups([
      tx({ accountId: 'a', side: 'BUYTOOPEN', quantity: 100, price: 100 }),
      tx({ accountId: 'b', side: 'BUYTOOPEN', quantity: 100, price: 100 }),
      tx({ accountId: 'a', side: 'SELLTOCLOSE', quantity: 100, price: 110, time: '10:00:00' }),
      tx({ accountId: 'b', side: 'SELLTOCLOSE', quantity: 100, price: 90, time: '10:00:00' }),
    ]);
    expect(groups).toHaveLength(2);
    const a = groups.find((g) => g.accountId === 'a')!;
    const b = groups.find((g) => g.accountId === 'b')!;
    expect(a.nativeGrossPnL).toBeCloseTo(1000);
    expect(b.nativeGrossPnL).toBeCloseTo(-1000);
  });

  it('carries commissions into net P&L (native)', () => {
    const groups = splitIntoTradeGroups([
      tx({ side: 'BUYTOOPEN', quantity: 100, price: 100, commission: -1 }),
      tx({ side: 'SELLTOCLOSE', quantity: 100, price: 105, commission: -1, time: '10:00:00' }),
    ]);
    expect(groups[0].nativeGrossPnL).toBeCloseTo(500);
    expect(groups[0].nativeTotalCommissions).toBeCloseTo(-2);
    expect(groups[0].nativeNetPnL).toBeCloseTo(498);
  });

  it('converts realized P&L and commissions to account currency via FX', () => {
    const groups = splitIntoTradeGroups([
      tx({
        symbol: '005930.KS', currency: 'KRW', side: 'BUYTOOPEN', quantity: 10, price: 100,
        commission: -10, fxAccountCurrency: 'USD', fxRateToAccount: 0.00075, fxRateDate: '20260813',
      }),
      tx({
        symbol: '005930.KS', currency: 'KRW', side: 'SELLTOCLOSE', quantity: 10, price: 110, time: '10:00:00',
        commission: -10, fxAccountCurrency: 'USD', fxRateToAccount: 0.0007, fxRateDate: '20260813',
      }),
    ]);
    // Native gross: (110-100)*10 = 100 KRW; account: 100 * 0.0007 (close-day) = 0.07
    expect(groups[0].nativeGrossPnL).toBeCloseTo(100);
    expect(groups[0].grossPnL).toBeCloseTo(0.07);
    expect(groups[0].accountCurrency).toBe('USD');
  });

  it('reconciles same-day totals with the day aggregator (no P&L drift)', () => {
    const fixture: TransactionRecord[] = [
      tx({ side: 'BUYTOOPEN', time: '09:30:00', quantity: 100, price: 100, commission: -1 }),
      tx({ side: 'BUYTOOPEN', time: '09:31:00', quantity: 100, price: 102, commission: -1 }),
      tx({ side: 'SELLTOCLOSE', time: '09:45:00', quantity: 200, price: 105, commission: -2 }),
      tx({ side: 'SELLTOOPEN', time: '10:15:00', quantity: 100, price: 110, commission: -1 }),
      tx({ side: 'BUYTOCLOSE', time: '10:30:00', quantity: 100, price: 108, commission: -1 }),
    ];
    const groups = splitIntoTradeGroups(fixture);
    const [day] = aggregateByDay(fixture);

    const groupGross = groups.reduce((s, g) => s + g.nativeGrossPnL, 0);
    const groupNet = groups.reduce((s, g) => s + g.nativeNetPnL, 0);

    // The day aggregator groups by symbol into one row; the split groups sum to
    // the same realized P&L and net.
    expect(groupGross).toBeCloseTo(day.trades[0].nativeGrossPnL!);
    expect(groupNet).toBeCloseTo(day.trades[0].nativeNetPnL!);
  });
});

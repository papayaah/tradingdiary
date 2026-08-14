import { describe, expect, it } from 'vitest';
import type { TransactionRecord } from '@/lib/db/schema';
import { aggregateByDay } from './aggregator';

function transaction(overrides: Partial<TransactionRecord>): TransactionRecord {
  return {
    tradeId: crypto.randomUUID(),
    accountId: 'account-usd',
    symbol: '005930.KS',
    companyName: 'Samsung Electronics',
    exchanges: 'KRX',
    side: 'BUYTOOPEN',
    orderType: 'MARKET',
    date: '20260625',
    time: '09:30:00',
    currency: 'KRW',
    quantity: 10,
    multiplier: 1,
    price: 100,
    totalValue: 1000,
    commission: -10,
    feeMultiplier: 1,
    fxAccountCurrency: 'USD',
    fxRateDate: '20260625',
    fxRateProvider: 'exchange-rate-api',
    ...overrides,
  };
}

describe('historical FX P&L aggregation', () => {
  it('converts realized profit at close-day FX and each commission at its transaction-day FX', () => {
    const summaries = aggregateByDay([
      transaction({ fxRateToAccount: 0.00075 }),
      transaction({
        tradeId: 'close',
        side: 'SELLTOCLOSE',
        time: '10:00:00',
        price: 110,
        totalValue: -1100,
        fxRateToAccount: 0.0007,
      }),
    ]);

    const trade = summaries[0].trades[0];
    expect(trade.nativeGrossPnL).toBe(100);
    expect(trade.nativeNetPnL).toBe(80);
    expect(trade.grossPnL).toBeCloseTo(0.07);
    expect(trade.totalCommissions).toBeCloseTo(-0.0145);
    expect(trade.netPnL).toBeCloseTo(0.0555);
    expect(trade.currency).toBe('KRW');
    expect(trade.accountCurrency).toBe('USD');
    expect(trade.fxRateDate).toBe('20260625');
  });
});

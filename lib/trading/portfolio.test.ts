import { describe, expect, it } from 'vitest';
import type { TransactionRecord } from '@/lib/db/schema';
import { computePortfolio } from './portfolio';

describe('computePortfolio', () => {
  it('keeps the execution price separate from a futures point multiplier', () => {
    const transaction: TransactionRecord = {
      tradeId: 'trade-1',
      accountId: 'account-1',
      symbol: 'MNQ=F',
      companyName: 'MNQ=F',
      exchanges: 'CME',
      side: 'BUYTOOPEN',
      orderType: 'MARKET',
      date: '20260727',
      time: '09:30:00',
      currency: 'USD',
      quantity: 2,
      multiplier: 2,
      price: 23000,
      totalValue: 92000,
      commission: 0,
      feeMultiplier: 1,
    };

    expect(computePortfolio([transaction])).toEqual([
      expect.objectContaining({
        averageCost: 23000,
        totalCost: 92000,
        multiplier: 2,
        quantity: 2,
      }),
    ]);
  });
});

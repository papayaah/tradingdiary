import { describe, expect, it } from 'vitest';
import type { TransactionRecord } from '@/lib/db/schema';
import {
  buildManualTransaction,
  getNetPosition,
  resolveTransactionSide,
} from './manual-entry';

function transaction(
  side: TransactionRecord['side'],
  quantity: number
): TransactionRecord {
  return {
    tradeId: `${side}-${quantity}`,
    accountId: 'account-1',
    symbol: 'MNQ=F',
    companyName: 'MNQ=F',
    exchanges: 'CME',
    side,
    orderType: 'MARKET',
    date: '20260727',
    time: '09:30:00',
    currency: 'USD',
    quantity,
    multiplier: 2,
    price: 23000,
    totalValue: quantity * 23000 * 2,
    commission: 0,
    feeMultiplier: 1,
  };
}

describe('manual trade entry', () => {
  it('uses opening and closing sides based on the current position', () => {
    expect(resolveTransactionSide('buy', 0)).toBe('BUYTOOPEN');
    expect(resolveTransactionSide('sell', 2)).toBe('SELLTOCLOSE');
    expect(resolveTransactionSide('sell', 0)).toBe('SELLTOOPEN');
    expect(resolveTransactionSide('buy', -2)).toBe('BUYTOCLOSE');
  });

  it('calculates the net position from transaction sides', () => {
    expect(getNetPosition([
      transaction('BUYTOOPEN', 3),
      transaction('SELLTOCLOSE', 1),
    ], 'MNQ=F')).toBe(2);
  });

  it('builds an MNQ transaction with Yahoo symbology and point value', () => {
    const result = buildManualTransaction({
      accountId: 'account-1',
      symbol: 'mnq',
      quantity: 2,
      direction: 'buy',
      price: 23000,
      date: '2026-07-27',
      time: '09:30',
      currency: 'USD',
    }, [], 'trade-1');

    expect(result).toMatchObject({
      tradeId: 'trade-1',
      symbol: 'MNQ=F',
      side: 'BUYTOOPEN',
      multiplier: 2,
      totalValue: 92000,
      date: '20260727',
      time: '09:30:00',
    });
  });
});

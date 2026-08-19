import { describe, expect, it } from 'vitest';
import type { TransactionRecord } from '@/lib/db/schema';
import { executionIdempotencyKey } from './execution-key';

const transaction = (side: TransactionRecord['side']): TransactionRecord => ({
  tradeId: 'ex-stable-id',
  accountId: 'ibkr-flex:U123',
  symbol: 'AAPL',
  companyName: 'Apple',
  exchanges: 'NASDAQ',
  side,
  orderType: 'MARKET',
  date: '2026-08-18',
  time: '10:00:00',
  currency: 'USD',
  quantity: 10,
  multiplier: 1,
  price: 200,
  totalValue: 2_000,
  commission: 1,
  feeMultiplier: 1,
});

describe('executionIdempotencyKey', () => {
  it('uses stable account and source identity rather than inferred side', () => {
    expect(executionIdempotencyKey(transaction('SELLTOOPEN')))
      .toBe(executionIdempotencyKey(transaction('SELLTOCLOSE')));
  });
});

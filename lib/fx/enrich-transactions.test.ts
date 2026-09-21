import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TransactionRecord } from '@/lib/db/schema';
import { enrichTransactionsWithHistoricalFx } from './enrich-transactions';

function tx(overrides: Partial<TransactionRecord>): TransactionRecord {
  return {
    tradeId: 't1',
    accountId: 'acct',
    symbol: 'HSIU6',
    companyName: 'HSI',
    side: 'SELLTOCLOSE',
    date: '20260917',
    time: '10:00:00',
    currency: 'HKD',
    quantity: 1,
    price: 100,
    totalValue: 100,
    commission: -1,
    ...overrides,
  } as TransactionRecord;
}

describe('enrichTransactionsWithHistoricalFx — single FX source', () => {
  afterEach(() => vi.restoreAllMocks());

  it('never overrides a broker (IBKR) rate and consults no second source', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const broker = tx({
      currency: 'HKD',
      fxRateToAccount: 0.128,
      fxAccountCurrency: 'USD',
      fxRateDate: '20260917',
      fxRateProvider: 'ibkr',
    });

    const [result] = await enrichTransactionsWithHistoricalFx([broker], 'USD');

    expect(result.fxRateToAccount).toBe(0.128);
    expect(result.fxRateProvider).toBe('ibkr');
    // The exchange-rate-api endpoint must not be hit when a broker rate exists.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('marks account-currency fills as rate 1 without any fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const usd = tx({ currency: 'USD', symbol: 'PDD', fxRateToAccount: undefined });

    const [result] = await enrichTransactionsWithHistoricalFx([usd], 'USD');

    expect(result.fxRateToAccount).toBe(1);
    expect(result.fxAccountCurrency).toBe('USD');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

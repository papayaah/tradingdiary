import { describe, expect, it } from 'vitest';
import { runJournalAnalyticsQuery, type JournalAssistantAccount, type JournalTradeRow } from './journal-query';

const selectedAccount: JournalAssistantAccount = {
  id: 'account-uuid-1',
  accountId: 'account-1',
  name: 'Main account',
  currency: 'USD',
};

function trade(overrides: Partial<JournalTradeRow> = {}): JournalTradeRow {
  return {
    id: crypto.randomUUID(),
    clientKey: crypto.randomUUID(),
    accountId: 'account-1',
    accountName: 'Main account',
    symbol: 'NVDA',
    side: 'LONG',
    currency: 'USD',
    openedTime: '09:30:00',
    tradingDay: '20260901',
    volume: 20,
    grossPnL: -10,
    totalCommissions: -1,
    netPnL: -11,
    isOpen: false,
    ...overrides,
  };
}

describe('runJournalAnalyticsQuery', () => {
  it('can compose an exact worst trading date without a hard-coded intent', () => {
    const rows = [
      trade({ id: 'a', tradingDay: '20260901', netPnL: -10 }),
      trade({ id: 'b', tradingDay: '20260901', netPnL: 5 }),
      trade({ id: 'c', tradingDay: '20260902', netPnL: -100 }),
      trade({ id: 'd', tradingDay: '20260902', netPnL: 20 }),
    ];
    const result = runJournalAnalyticsQuery(rows, {
      dimensions: ['tradingDay'],
      metrics: [{ operation: 'sum', field: 'netPnL', alias: 'totalNetPnL' }],
      orderBy: [{ field: 'totalNetPnL', direction: 'asc' }],
      limit: 1,
    }, { selectedAccount, dataAsOf: '2026-09-06T00:00:00.000Z' });

    expect(result.rows).toEqual([{ tradingDay: '20260902', totalNetPnL: -80 }]);
    expect(result.evidence.map((item) => item.tradeGroupId)).toEqual(['c', 'd']);
    expect(result.query.dimensions).toEqual(['tradingDay']);
  });

  it('supports arbitrary filters, groupings, and multiple metrics', () => {
    const result = runJournalAnalyticsQuery([
      trade({ symbol: 'NVDA', side: 'LONG', netPnL: 50 }),
      trade({ symbol: 'NVDA', side: 'SHORT', netPnL: -20 }),
      trade({ symbol: 'AAPL', side: 'LONG', netPnL: 5 }),
    ], {
      dimensions: ['symbol'],
      metrics: [
        { operation: 'count', alias: 'trades' },
        { operation: 'win_rate', alias: 'winRate' },
        { operation: 'sum', field: 'netPnL', alias: 'net' },
      ],
      filters: [{ field: 'side', operator: 'equals', value: 'long' }],
      orderBy: [{ field: 'net', direction: 'desc' }],
    }, { selectedAccount });

    expect(result.rows).toEqual([
      { symbol: 'NVDA', trades: 1, winRate: 100, net: 50 },
      { symbol: 'AAPL', trades: 1, winRate: 100, net: 5 },
    ]);
  });

  it('automatically separates monetary results by currency', () => {
    const result = runJournalAnalyticsQuery([
      trade({ netPnL: 100, currency: 'USD' }),
      trade({ id: 'php', accountId: 'account-2', accountName: 'PHP account', currency: 'PHP', netPnL: 5_000 }),
    ], {
      metrics: [{ operation: 'sum', field: 'netPnL', alias: 'net' }],
      accountScope: 'all',
    }, { selectedAccount });

    expect(result.query.dimensions).toEqual(['currency']);
    expect(result.rows).toEqual([
      { currency: 'PHP', net: 5_000 },
      { currency: 'USD', net: 100 },
    ]);
    expect(result.currencyWarning).toContain('split by account currency');
  });

  it('excludes open positions by default', () => {
    const result = runJournalAnalyticsQuery([
      trade({ netPnL: 10 }),
      trade({ id: 'open', isOpen: true, netPnL: 1_000 }),
    ], {
      metrics: [{ operation: 'sum', field: 'netPnL', alias: 'net' }],
    }, { selectedAccount });

    expect(result.rows).toEqual([{ net: 10 }]);
    expect(result.matchedTradeCount).toBe(1);
  });
});

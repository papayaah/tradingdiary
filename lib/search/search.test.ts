import { describe, expect, it } from 'vitest';
import type { AggregatedTrade } from '@/lib/trading/aggregator';
import { parseSearchQuery, searchIndex } from './search';

function trade(overrides: Partial<AggregatedTrade> = {}): AggregatedTrade {
  return {
    symbol: 'AAPL',
    companyName: 'Apple Inc',
    date: '20260805',
    firstTradeTime: '09:30:00',
    volume: 20,
    executions: 2,
    grossPnL: -50,
    totalCommissions: -2,
    netPnL: -52,
    side: 'LONG',
    isOpen: false,
    netQuantity: 0,
    openAvgCost: 0,
    transactions: [],
    ...overrides,
  };
}

const index = {
  trades: [trade(), trade({ symbol: 'NVDA', companyName: 'Nvidia', netPnL: 120, grossPnL: 122, side: 'SHORT', isOpen: true })],
  dailyNotes: [{ date: '20260805', accountId: 'account-1', content: 'Waited patiently for confirmation', updatedAt: 1 }],
  tradeNotes: [{ date: '20260805', symbol: 'AAPL', accountId: 'account-1', content: 'Chased the breakout', tags: ['revenge'], updatedAt: 1 }],
};

describe('global search', () => {
  it('parses friendly trade filters', () => {
    expect(parseSearchQuery('AAPL losses long 2026-08-05')).toEqual({
      text: 'aapl',
      side: 'LONG',
      result: 'loss',
      date: '20260805',
    });
  });

  it('supports explicit filters', () => {
    const results = searchIndex(index, 'symbol:AAPL result:loss');
    expect(results.filter((result) => result.kind === 'trade').map((result) => result.title)).toEqual(['AAPL']);
  });

  it('finds tagged notes without returning unrelated trades', () => {
    const results = searchIndex(index, 'tag:revenge');
    expect(results.some((result) => result.id === 'trade-note-20260805-AAPL')).toBe(true);
    expect(results.some((result) => result.kind === 'trade')).toBe(false);
  });

  it('shows only navigation and actions for an empty query', () => {
    expect(searchIndex(index, '').every((result) => result.kind === 'navigation' || result.kind === 'action')).toBe(true);
  });
});

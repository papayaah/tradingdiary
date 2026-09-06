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
  tradeNotes: [{ tradeGroupKey: 'account-1 AAPL 20260805 09:30:00 0', date: '20260805', symbol: 'AAPL', accountId: 'account-1', content: 'Chased the breakout', tags: ['revenge'], updatedAt: 1 }],
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

  it('parses partial dates (year, month name, month+year)', () => {
    expect(parseSearchQuery('nvda 2025')).toMatchObject({ text: 'nvda', year: '2025' });
    expect(parseSearchQuery('nvda may')).toMatchObject({ text: 'nvda', month: '05' });
    expect(parseSearchQuery('nvda may 2024')).toMatchObject({ text: 'nvda', month: '05', year: '2024' });
    expect(parseSearchQuery('nvda 2024-05')).toMatchObject({ text: 'nvda', month: '05', year: '2024' });
  });

  it('filters by month across years, by month+year, and by year', () => {
    const idx = {
      trades: [
        trade({ symbol: 'NVDA', companyName: 'Nvidia', date: '20240515' }),
        trade({ symbol: 'NVDA', companyName: 'Nvidia', date: '20250520' }),
        trade({ symbol: 'NVDA', companyName: 'Nvidia', date: '20240610' }),
      ],
      dailyNotes: [],
      tradeNotes: [],
    };
    const dates = (q: string) =>
      searchIndex(idx, q).filter((r) => r.kind === 'trade').map((r) => r.date).sort();

    expect(dates('nvda may')).toEqual(['20240515', '20250520']); // any-year May
    expect(dates('nvda may 2024')).toEqual(['20240515']); // May 2024 only
    expect(dates('nvda 2024')).toEqual(['20240515', '20240610']); // all of 2024
  });

  it('orders same-symbol trades newest-first and carries the date', () => {
    const many = {
      trades: [
        trade({ date: '20260101' }),
        trade({ date: '20260805' }),
        trade({ date: '20260320' }),
      ],
      dailyNotes: [],
      tradeNotes: [],
    };
    const dates = searchIndex(many, 'symbol:AAPL')
      .filter((r) => r.kind === 'trade')
      .map((r) => r.date);
    expect(dates).toEqual(['20260805', '20260320', '20260101']);
  });
});

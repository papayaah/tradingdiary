import { describe, expect, it } from 'vitest';
import {
  isSupportedSymbolSearchCandidate,
  parseSymbolSearchCategory,
  type SymbolSearchCandidate,
} from './symbol-search';

const candidate = (
  symbol: string,
  exchangeCode: string,
  type: string,
): SymbolSearchCandidate => ({ symbol, exchangeCode, type });

describe('symbol search category filtering', () => {
  it('keeps US-listed equities and ETFs in the stocks category', () => {
    expect(isSupportedSymbolSearchCandidate(candidate('AAPL', 'NMS', 'EQUITY'), 'stocks')).toBe(true);
    expect(isSupportedSymbolSearchCandidate(candidate('AAPU', 'NGM', 'ETF'), 'stocks')).toBe(true);
  });

  it('rejects foreign listings and crypto results from the stocks category', () => {
    expect(isSupportedSymbolSearchCandidate(candidate('AAPL.BA', 'BUE', 'EQUITY'), 'stocks')).toBe(false);
    expect(isSupportedSymbolSearchCandidate(candidate('AAPL.NE', 'NEO', 'EQUITY'), 'stocks')).toBe(false);
    expect(isSupportedSymbolSearchCandidate(candidate('AAPLX-USD', 'CCC', 'CRYPTOCURRENCY'), 'stocks')).toBe(false);
  });

  it('keeps only USD crypto pairs in crypto and Yahoo futures in futures', () => {
    expect(isSupportedSymbolSearchCandidate(candidate('BTC-USD', 'CCC', 'CRYPTOCURRENCY'), 'crypto')).toBe(true);
    expect(isSupportedSymbolSearchCandidate(candidate('BTC-CAD', 'CCC', 'CRYPTOCURRENCY'), 'crypto')).toBe(false);
    expect(isSupportedSymbolSearchCandidate(candidate('ES=F', 'CME', 'FUTURE'), 'futures')).toBe(true);
    expect(isSupportedSymbolSearchCandidate(candidate('ES', 'NYQ', 'EQUITY'), 'futures')).toBe(false);
  });

  it('defaults unknown category values to stocks', () => {
    expect(parseSymbolSearchCategory(null)).toBe('stocks');
    expect(parseSymbolSearchCategory('anything')).toBe('stocks');
    expect(parseSymbolSearchCategory('crypto')).toBe('crypto');
  });
});

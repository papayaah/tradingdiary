import { describe, expect, it } from 'vitest';
import { parseFuturesSymbol } from './futures-symbol';

describe('broker futures symbols', () => {
  it.each([
    ['FDXM 20261218 M', 'FDXM', '20261218'],
    ['FDXM 20260918 M', 'FDXM', '20260918'],
    ['MINZ6', 'MIN', '202612'],
    ['FCEV6', 'FCE', '202610'],
    ['MNQZ26', 'MNQ', '202612'],
    ['M2KU6', 'M2K', '202609'],
  ])('preserves the expiry of %s', (symbol, root, contractMonth) => {
    expect(parseFuturesSymbol(symbol, '20261009')).toEqual({ root, contractMonth, hasFuturesNotation: true });
  });

  it('resolves a one-digit year relative to the historical trade date', () => {
    expect(parseFuturesSymbol('MNQZ9', '20190501').contractMonth).toBe('201912');
  });

  it.each(['MNQ=F', '/MNQ', 'MNQ.C.0'])('keeps %s continuous without inventing an expiry', (symbol) => {
    expect(parseFuturesSymbol(symbol)).toEqual({ root: 'MNQ', hasFuturesNotation: true });
  });

  it('does not classify normal stock symbols as futures', () => {
    expect(parseFuturesSymbol(' aapl ')).toEqual({ root: 'AAPL', hasFuturesNotation: false });
  });
});

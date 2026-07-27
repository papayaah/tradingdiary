import { describe, expect, it } from 'vitest';
import { getFuturesRoot, getInstrumentDetails } from './instruments';

describe('instrument details', () => {
  it('normalizes a plain micro Nasdaq root for Yahoo', () => {
    expect(getInstrumentDetails('mnq')).toEqual({
      symbol: 'MNQ=F',
      assetClass: 'future',
      multiplier: 2,
      quoteProvider: 'Yahoo Finance',
    });
  });

  it('normalizes common contract formats to a continuous Yahoo symbol', () => {
    expect(getFuturesRoot('/NQ')).toBe('NQ');
    expect(getFuturesRoot('MNQU6')).toBe('MNQ');
    expect(getFuturesRoot('ES.C.0')).toBe('ES');
    expect(getInstrumentDetails('MNQU6').symbol).toBe('MNQ=F');
  });

  it('leaves equities unchanged with a multiplier of one', () => {
    expect(getInstrumentDetails(' aapl ')).toMatchObject({
      symbol: 'AAPL',
      assetClass: 'equity',
      multiplier: 1,
    });
  });
});

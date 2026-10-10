import { describe, expect, it } from 'vitest';
import { ibkrContractSpecForRoot, ibkrEquityContractSpec, ibkrFuturesContractSpecForDate, ibkrEndOfDayUtc } from './ibkr-client';
import { SecType } from '@stoqey/ib';

describe('IBKR futures contract routing', () => {
  it.each([
    ['20261009', '20261010-04:00:00'],
    ['20260115', '20260116-05:00:00'],
    ['20260308', '20260309-04:00:00'],
    ['20261231', '20270101-05:00:00'],
  ])('sends %s with an exchange-independent UTC end time', (day, end) => {
    expect(ibkrEndOfDayUtc(day)).toBe(end);
  });

  it('qualifies the imported Mini DAX contract rather than the full-size DAX or a US stock', () => {
    expect(ibkrFuturesContractSpecForDate('FDXM 20261218 M', '20261009')).toEqual({
      symbol: 'DAX', exchange: 'EUREX', currency: 'EUR', tradingClass: 'FDXM',
      secType: SecType.FUT, includeExpired: true, lastTradeDateOrContractMonth: '20261218',
    });
  });

  it('preserves an expired contract for a historical trade chart', () => {
    expect(ibkrFuturesContractSpecForDate('FDXM 20260918 M', '20260910').lastTradeDateOrContractMonth)
      .toBe('20260918');
  });

  it('routes the imported Mini FTSE MIB through IDEM in EUR', () => {
    expect(ibkrFuturesContractSpecForDate('MINZ6', '20261009')).toMatchObject({
      symbol: 'FTMIB', exchange: 'IDEM', currency: 'EUR', tradingClass: 'MIN',
      lastTradeDateOrContractMonth: '202612',
    });
  });

  it.each([
    ['NIY', { symbol: 'NIY', exchange: 'CME', currency: 'JPY' }],
    ['K200', { symbol: 'K200', exchange: 'KSE', currency: 'KRW' }],
    ['HSI', { symbol: 'HSI', exchange: 'HKFE', currency: 'HKD' }],
    ['SPI', { symbol: 'SPI', exchange: 'SNFE', currency: 'AUD' }],
    ['SSG', { symbol: 'SSG', exchange: 'SGX', currency: 'SGD' }],
  ])('routes %s to its native contract', (root, expected) => {
    expect(ibkrContractSpecForRoot(root)).toEqual(expected);
  });

  it('preserves existing aliases and CME defaults', () => {
    expect(ibkrContractSpecForRoot('BTC')).toEqual({
      symbol: 'BRR',
      exchange: 'CME',
      currency: 'USD',
    });
  });
});

describe('IBKR equity contract routing', () => {
  it('builds a SMART-routed stock contract', () => {
    expect(ibkrEquityContractSpec(' aapl ')).toEqual({
      symbol: 'AAPL',
      secType: SecType.STK,
      exchange: 'SMART',
      currency: 'USD',
    });
  });
});

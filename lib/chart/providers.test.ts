import { afterEach, describe, expect, it, vi } from 'vitest';
import { getActiveProvider } from './providers';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Tiingo crypto provider routing', () => {
  it('routes BTC-USD through the crypto endpoint and maps nested price data', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{
        ticker: 'btcusd',
        baseCurrency: 'btc',
        quoteCurrency: 'usd',
        priceData: [{
          date: '2026-07-26T00:00:00Z',
          open: 100,
          high: 104,
          low: 99,
          close: 103,
          volume: 12.5,
        }],
      }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = getActiveProvider('BTC-USD', {
      preferredProvider: 'tiingo',
      tiingoKey: 'test-token',
    });
    const candles = await provider.fetchRecentCandles('BTC-USD', '5m');

    expect(provider.name).toBe('Tiingo Crypto');
    expect(fetchMock).toHaveBeenCalledOnce();
    const requestUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestUrl).toContain('/tiingo/crypto/prices?');
    expect(requestUrl).toContain('tickers=BTCUSD');
    expect(requestUrl).toContain('resampleFreq=5min');
    expect(requestUrl).not.toContain('/iex/');
    expect(candles).toEqual([{
      time: 1785024000,
      open: 100,
      high: 104,
      low: 99,
      close: 103,
      volume: 12.5,
    }]);
  });

  it('keeps equity symbols on the Tiingo equity provider', () => {
    const provider = getActiveProvider('AAPL', {
      preferredProvider: 'tiingo',
      tiingoKey: 'test-token',
    });

    expect(provider.name).toBe('Tiingo');
  });
});

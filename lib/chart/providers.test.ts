import { afterEach, describe, expect, it, vi } from 'vitest';
import { FallbackProvider, getActiveProvider, type ChartProvider } from './providers';
import type { OHLCCandle } from './types';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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

  it('explicitly requests and maps equity intraday volume', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{
        date: '2026-07-31T13:30:00Z',
        open: 100,
        high: 101,
        low: 99.5,
        close: 100.75,
        volume: 42_500,
      }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = getActiveProvider('AAPL', {
      preferredProvider: 'tiingo',
      tiingoKey: 'test-token',
    });
    const candles = await provider.fetchRecentCandles('AAPL', '10m');

    const requestUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestUrl).toContain('columns=open,high,low,close,volume');
    expect(candles[0].volume).toBe(42_500);
  });
});

describe('regional futures fallback', () => {
  it('prioritizes deployed IBKR for futures', () => {
    vi.stubEnv('IBKR_ENABLED', 'true');
    const provider = getActiveProvider('SPI=F', undefined, 'futures');

    expect(provider).toBeInstanceOf(FallbackProvider);
    expect((provider as FallbackProvider).primaryName).toBe('IBKR (CME)');
  });

  it('returns no data after an expected provider miss', async () => {
    const unavailable: ChartProvider = {
      name: 'Unavailable',
      fetchCandles: async (): Promise<OHLCCandle[]> => { throw new Error('unavailable'); },
      fetchRecentCandles: async (): Promise<OHLCCandle[]> => [],
    };
    const provider = new FallbackProvider('Futures', [unavailable], true);

    await expect(provider.fetchRecentCandles('K200=F', '10m')).resolves.toEqual([]);
  });

  it('uses Yahoo directly when the IBKR gateway is not configured', () => {
    vi.stubEnv('IBKR_ENABLED', 'false');
    vi.stubEnv('IBKR_GATEWAY_HOST', '');

    expect(getActiveProvider('NQ=F', undefined, 'futures').name).toBe('Yahoo Finance');
  });

  it('keeps normal futures misses as errors', async () => {
    const unavailable: ChartProvider = {
      name: 'Unavailable',
      fetchCandles: async (): Promise<OHLCCandle[]> => [],
      fetchRecentCandles: async (): Promise<OHLCCandle[]> => [],
    };
    const provider = new FallbackProvider('Futures', [unavailable]);

    await expect(provider.fetchRecentCandles('NQ=F', '10m')).rejects.toThrow('returned no candles');
  });
});

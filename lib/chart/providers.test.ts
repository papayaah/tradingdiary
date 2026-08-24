import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FallbackProvider, getActiveProvider, type ChartProvider } from './providers';
import type { OHLCCandle } from './types';

vi.mock('@/lib/market-data/provider-request-gate', () => ({
  fetchWithProviderQuota: (_provider: string, input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    fetch(input, init),
  reserveProviderRequest: vi.fn(async () => {}),
  providerCredentialScope: (provider: string) => `${provider}:test`,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Tiingo crypto provider routing', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_CRYPTO_MARKET_DATA_ENABLED', 'true');
  });

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
      preferredCryptoProvider: 'tiingo',
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
      preferredEquitiesProvider: 'tiingo',
      tiingoKey: 'test-token',
    });

    expect(provider.name).toBe('Tiingo');
  });

  it('trusts explicit crypto asset class for a concatenated canonical symbol', () => {
    const provider = getActiveProvider('APTUSD', {
      preferredCryptoProvider: 'tiingo',
      tiingoKey: 'test-token',
    }, 'crypto');

    expect(provider.name).toBe('Tiingo Crypto');
  });

  it('blocks crypto providers before an upstream request when the launch switch is off', () => {
    vi.stubEnv('NEXT_PUBLIC_CRYPTO_MARKET_DATA_ENABLED', 'false');

    expect(() => getActiveProvider('BTC-USD', {
      preferredCryptoProvider: 'tiingo',
      tiingoKey: 'test-token',
    })).toThrow('temporarily disabled');
  });

  it('explicitly requests and maps equity intraday volume', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => [
        'date,open,high,low,close,volume',
        '2026-07-31 09:30:00-04:00,100,101,99.5,100.75,42500',
      ].join('\n'),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = getActiveProvider('AAPL', {
      preferredEquitiesProvider: 'tiingo',
      tiingoKey: 'test-token',
    });
    const candles = await provider.fetchRecentCandles('AAPL', '10m');

    const requestUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestUrl).toContain('columns=open,high,low,close,volume');
    expect(requestUrl).toContain('format=csv');
    expect(candles[0].volume).toBe(42_500);
  });

  it('falls through to IEX when the consolidated endpoint returns an empty 200', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => [
          'date,open,high,low,close,volume',
          '2026-08-07 11:30:00-04:00,7.25,7.3,7.24,7.285,12000',
        ].join('\n'),
      });
    vi.stubGlobal('fetch', fetchMock);

    const provider = getActiveProvider('VNET', {
      preferredEquitiesProvider: 'tiingo',
      tiingoKey: 'test-token',
    });
    const candles = await provider.fetchCandles('VNET', '20260807', '10m');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/iex/VNET/prices?');
    expect(String(fetchMock.mock.calls[1][0])).toContain('format=csv');
    expect(candles.at(-1)?.close).toBe(7.285);
  });

  it('uses the Tiingo daily endpoint for the previous-close series', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => [
        'date,close,high,low,open,volume,adjClose,adjHigh,adjLow,adjOpen,adjVolume,divCash,splitFactor',
        '2026-08-06,18.65,18.8,18.4,18.5,1000,18.6,18.75,18.35,18.45,1000,0,1',
      ].join('\n'),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = getActiveProvider('BILI', {
      preferredEquitiesProvider: 'tiingo',
      tiingoKey: 'test-token',
    });
    const candles = await provider.fetchRecentCandles('BILI', '1d');

    const requestUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestUrl).toContain('/tiingo/daily/BILI/prices?');
    expect(requestUrl).toContain('format=csv');
    expect(candles.at(-1)?.close).toBe(18.6);
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

describe('IBKR equity provider routing', () => {
  it('uses IBKR for equities when selected and the gateway is configured', () => {
    vi.stubEnv('IBKR_ENABLED', 'true');

    expect(getActiveProvider('AAPL', { preferredEquitiesProvider: 'ibkr' }, 'equity').name)
      .toBe('IBKR (Stocks)');
  });

  it('falls through to a configured REST provider when the gateway is unavailable', () => {
    vi.stubEnv('IBKR_ENABLED', 'false');
    vi.stubEnv('IBKR_GATEWAY_HOST', '');
    vi.stubEnv('TIINGO_API_KEY', 'server-token');

    expect(getActiveProvider('AAPL', { preferredEquitiesProvider: 'ibkr' }, 'equity').name)
      .toBe('Tiingo');
  });

  it('allows a server-wide IBKR equities selection for the scanner', () => {
    vi.stubEnv('IBKR_ENABLED', 'true');
    vi.stubEnv('EQUITIES_PROVIDER', 'ibkr');

    expect(getActiveProvider('AAPL', undefined, 'equity').name).toBe('IBKR (Stocks)');
  });
});

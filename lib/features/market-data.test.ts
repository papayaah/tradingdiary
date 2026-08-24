import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  filterEnabledMarketDataItems,
  isCryptoMarketDataEnabled,
  isCryptoMarketDataSymbol,
  isMarketDataAssetClassEnabled,
} from './market-data';

afterEach(() => vi.unstubAllEnvs());

describe('crypto market-data launch switch', () => {
  it('is disabled by default and hides crypto items', () => {
    vi.stubEnv('NEXT_PUBLIC_CRYPTO_MARKET_DATA_ENABLED', '');

    expect(isCryptoMarketDataEnabled()).toBe(false);
    expect(isMarketDataAssetClassEnabled('crypto')).toBe(false);
    expect(isMarketDataAssetClassEnabled('equity')).toBe(true);
    expect(isCryptoMarketDataSymbol('btc-usd')).toBe(true);
    expect(filterEnabledMarketDataItems([
      { symbol: 'AAPL' },
      { symbol: 'BTC-USD' },
      { symbol: 'NQ=F' },
    ])).toEqual([{ symbol: 'AAPL' }, { symbol: 'NQ=F' }]);
  });

  it('restores the preserved crypto path when explicitly enabled', () => {
    vi.stubEnv('NEXT_PUBLIC_CRYPTO_MARKET_DATA_ENABLED', 'true');

    expect(isCryptoMarketDataEnabled()).toBe(true);
    expect(isMarketDataAssetClassEnabled('crypto')).toBe(true);
    expect(filterEnabledMarketDataItems([{ symbol: 'BTC-USD' }]))
      .toEqual([{ symbol: 'BTC-USD' }]);
  });
});

import type { AssetClass } from '@/lib/scanner/sessions';

/**
 * Launch switch for crypto market data. It is intentionally off by default;
 * setting NEXT_PUBLIC_CRYPTO_MARKET_DATA_ENABLED=true re-enables the preserved
 * provider, scanner, API, and UI paths on the next build/restart.
 */
export function isCryptoMarketDataEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CRYPTO_MARKET_DATA_ENABLED === 'true';
}

export function isCryptoMarketDataSymbol(symbol: string): boolean {
  return symbol.trim().toUpperCase().endsWith('-USD');
}

export function isMarketDataAssetClassEnabled(assetClass: AssetClass | string): boolean {
  return assetClass !== 'crypto' || isCryptoMarketDataEnabled();
}

export function filterEnabledMarketDataItems<T extends { symbol: string }>(items: T[]): T[] {
  return isCryptoMarketDataEnabled()
    ? items
    : items.filter((item) => !isCryptoMarketDataSymbol(item.symbol));
}

export interface WatchSyncInput {
  symbol: string;
  interval: string;
}

export interface ScannerSyncWatch {
  symbol: string;
  interval: string;
}

export function buildScannerSyncWatchlist(
  items: WatchSyncInput[],
): ScannerSyncWatch[] {
  return items.map((item) => ({
    symbol: item.symbol,
    interval: item.interval,
  }));
}

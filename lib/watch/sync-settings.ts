export interface WatchThresholdInput {
  symbol: string;
  interval: string;
  minMovePercent: number;
}

export interface ScannerSyncWatch {
  symbol: string;
  interval: string;
  minMovePercent: number;
}

export function buildScannerSyncWatchlist(
  items: WatchThresholdInput[],
  minMoveOverride: number | null,
): ScannerSyncWatch[] {
  return items.map((item) => ({
    symbol: item.symbol,
    interval: item.interval,
    minMovePercent: minMoveOverride ?? item.minMovePercent,
  }));
}

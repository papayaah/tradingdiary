export interface OHLCCandle {
  time: number; // unix timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CachedChartData {
  symbol: string;
  date: string;
  interval: string;
  candles: OHLCCandle[];
  fetchedAt: number;
}

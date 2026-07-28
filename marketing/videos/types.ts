export type Candle = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  signal?: boolean;
};

export type PatternPromoConfig = {
  id: string;
  compositionId: string;
  symbol: string;
  interval: string;
  title: string;
  direction: 'bullish' | 'bearish';
  change: string;
  headline: [string, string];
  subhead: string;
  alertTitle: string;
  alertDescription: string;
  explanation: string;
  candles: Candle[];
  signalStartIndex: number;
};

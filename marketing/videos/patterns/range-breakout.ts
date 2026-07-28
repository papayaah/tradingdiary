import type { PatternPromoConfig } from '../types';

export const rangeBreakoutPromo: PatternPromoConfig = {
  id: 'range-breakout',
  compositionId: 'RangeBreakout',
  symbol: 'AMD',
  interval: '10m',
  title: 'Range Breakout',
  direction: 'bullish',
  change: '+1.96%',
  headline: ['A defined range.', 'A decisive break.'],
  subhead: 'Know when price escapes the prior trading range.',
  alertTitle: 'Bullish Range Breakout',
  alertDescription: 'Price closed above the prior 10-candle high',
  explanation: 'The range breaks. You get the signal.',
  signalStartIndex: 7,
  candles: [
    { open: 154, close: 154.5, high: 155, low: 153.7 },
    { open: 154.5, close: 154.1, high: 154.9, low: 153.8 },
    { open: 154.1, close: 154.7, high: 155.1, low: 153.9 },
    { open: 154.7, close: 154.3, high: 155, low: 154 },
    { open: 154.3, close: 154.8, high: 155.15, low: 154.1 },
    { open: 154.8, close: 154.6, high: 155, low: 154.2 },
    { open: 154.6, close: 154.9, high: 155.1, low: 154.3 },
    { open: 154.9, close: 158, high: 158.4, low: 154.7, signal: true },
  ],
};

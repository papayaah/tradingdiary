import type { PatternPromoConfig } from '../types';

export const consecutivePromo: PatternPromoConfig = {
  id: 'consecutive',
  compositionId: 'ConsecutiveMove',
  symbol: 'NVDA',
  interval: '10m',
  title: 'Consecutive Move',
  direction: 'bullish',
  change: '+3.44%',
  headline: ['Three candles.', 'One clear signal.'],
  subhead: 'See momentum building before the crowd does.',
  alertTitle: 'Bullish Consecutive Move',
  alertDescription: '3 same-color candles closing progressively higher',
  explanation: 'Momentum, spotted automatically.',
  signalStartIndex: 5,
  candles: [
    { open: 102, close: 102.3, high: 102.7, low: 101.7 },
    { open: 102.3, close: 102.1, high: 102.6, low: 101.8 },
    { open: 102.1, close: 102.5, high: 102.8, low: 101.9 },
    { open: 102.5, close: 102.35, high: 102.75, low: 102.1 },
    { open: 102.35, close: 102.55, high: 102.85, low: 102.2 },
    { open: 102.55, close: 103.45, high: 103.7, low: 102.4, signal: true },
    { open: 103.3, close: 104.45, high: 104.75, low: 103.1, signal: true },
    { open: 104.35, close: 105.8, high: 106.15, low: 104.15, signal: true },
  ],
};

import type { PatternPromoConfig } from '../types';

export const momentumBurstPromo: PatternPromoConfig = {
  id: 'momentum-burst',
  compositionId: 'MomentumBurst',
  symbol: 'TSLA',
  interval: '5m',
  title: 'Momentum Burst',
  direction: 'bullish',
  change: '+2.81%',
  headline: ['Small candles.', 'Sudden acceleration.'],
  subhead: 'Catch the moment price expands beyond its recent rhythm.',
  alertTitle: 'Bullish Momentum Burst',
  alertDescription: 'Large candle body versus the recent average',
  explanation: 'Acceleration, detected in real time.',
  signalStartIndex: 7,
  candles: [
    { open: 242, close: 242.4, high: 242.8, low: 241.7 },
    { open: 242.4, close: 242.1, high: 242.7, low: 241.9 },
    { open: 242.1, close: 242.6, high: 242.9, low: 241.8 },
    { open: 242.6, close: 242.8, high: 243.1, low: 242.2 },
    { open: 242.8, close: 242.5, high: 243, low: 242.1 },
    { open: 242.5, close: 242.9, high: 243.2, low: 242.3 },
    { open: 242.9, close: 243.1, high: 243.4, low: 242.6 },
    { open: 243.1, close: 249.9, high: 250.5, low: 242.9, volume: 2.1, signal: true },
  ],
};

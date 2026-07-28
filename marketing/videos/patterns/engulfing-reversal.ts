import type { PatternPromoConfig } from '../types';

export const engulfingReversalPromo: PatternPromoConfig = {
  id: 'engulfing-reversal',
  compositionId: 'EngulfingReversal',
  symbol: 'META',
  interval: '15m',
  title: 'Engulfing Reversal',
  direction: 'bullish',
  change: '+1.72%',
  headline: ['Pressure fades.', 'Control flips.'],
  subhead: 'Spot the candle that completely changes the balance.',
  alertTitle: 'Bullish Engulfing Reversal',
  alertDescription: 'Current body fully engulfed the prior bearish body',
  explanation: 'A reversal you can see—and scan.',
  signalStartIndex: 7,
  candles: [
    { open: 648, close: 647.4, high: 648.4, low: 647.1 },
    { open: 647.4, close: 646.8, high: 647.7, low: 646.4 },
    { open: 646.8, close: 646.2, high: 647, low: 645.8 },
    { open: 646.2, close: 645.7, high: 646.5, low: 645.4 },
    { open: 645.7, close: 645.1, high: 646, low: 644.8 },
    { open: 645.1, close: 644.7, high: 645.4, low: 644.4 },
    { open: 644.9, close: 643.8, high: 645.1, low: 643.4 },
    { open: 643.5, close: 645.5, high: 645.9, low: 643.2, signal: true },
  ],
};

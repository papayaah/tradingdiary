import type { PatternPromoConfig } from '../types';

export const volumeExpansionPromo: PatternPromoConfig = {
  id: 'volume-expansion',
  compositionId: 'VolumeExpansion',
  symbol: 'PLTR',
  interval: '5m',
  title: 'Volume Expansion',
  direction: 'bullish',
  change: '+2.24%',
  headline: ['Price moves.', 'Volume confirms.'],
  subhead: 'Find directional moves backed by unusual participation.',
  alertTitle: 'Bullish Volume Expansion',
  alertDescription: 'Directional move with at least 2× recent volume',
  explanation: 'More participation. More conviction.',
  signalStartIndex: 7,
  candles: [
    { open: 88, close: 88.3, high: 88.6, low: 87.8, volume: 0.35 },
    { open: 88.3, close: 88.1, high: 88.5, low: 87.9, volume: 0.28 },
    { open: 88.1, close: 88.5, high: 88.8, low: 88, volume: 0.4 },
    { open: 88.5, close: 88.4, high: 88.7, low: 88.1, volume: 0.32 },
    { open: 88.4, close: 88.8, high: 89, low: 88.2, volume: 0.38 },
    { open: 88.8, close: 88.6, high: 89, low: 88.4, volume: 0.3 },
    { open: 88.6, close: 88.9, high: 89.1, low: 88.5, volume: 0.36 },
    { open: 88.9, close: 90.9, high: 91.2, low: 88.7, volume: 1, signal: true },
  ],
};

import {
  candleBodyChange,
  directionalMatch,
  type PatternDefinition,
} from './types';

export const volumeExpansionPattern = {
  id: 'volume-expansion',
  name: 'Volume Expansion',
  shortDescription: 'A directional move on at least 2× recent average volume.',
  minimumCandles: () => 11,
  evaluateAt: (candles, index, { minMovePercent }) => {
    const candle = candles[index];
    const prior = candles.slice(index - 10, index);
    const averageVolume = prior.reduce((sum, item) => sum + item.volume, 0) / prior.length;
    const change = candleBodyChange(candle);
    if (change < minMovePercent || averageVolume <= 0 || candle.volume < averageVolume * 2) return null;

    return directionalMatch(
      candle,
      change,
      'volume-expansion',
      `Bullish Volume Expansion (+${change.toFixed(2)}%, 2× volume)`,
      `Bearish Volume Expansion (-${change.toFixed(2)}%, 2× volume)`,
    );
  },
} satisfies PatternDefinition<'volume-expansion'>;

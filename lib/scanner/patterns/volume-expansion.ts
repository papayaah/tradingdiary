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
    const populatedVolumes = prior
      .map((item) => item.volume)
      .filter((volume) => Number.isFinite(volume) && volume > 0);
    // A rolling baseline dominated by missing/force-filled zero-volume bars is
    // not trustworthy. Require at least 80% coverage, then average only actual
    // traded-volume observations.
    if (populatedVolumes.length < Math.ceil(prior.length * 0.8)) return null;
    const averageVolume = populatedVolumes.reduce((sum, volume) => sum + volume, 0)
      / populatedVolumes.length;
    const change = candleBodyChange(candle);
    if (
      change < minMovePercent
      || !Number.isFinite(candle.volume)
      || candle.volume <= 0
      || candle.volume < averageVolume * 2
    ) return null;

    return directionalMatch(
      candle,
      change,
      'volume-expansion',
      `Bullish Volume Expansion (+${change.toFixed(2)}%, 2× volume)`,
      `Bearish Volume Expansion (-${change.toFixed(2)}%, 2× volume)`,
    );
  },
} satisfies PatternDefinition<'volume-expansion'>;

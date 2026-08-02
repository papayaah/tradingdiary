import {
  candleBodyChange,
  directionalMatch,
  type PatternDefinition,
} from './types';

export const volumeExpansionPattern = {
  id: 'volume-expansion',
  name: 'Volume Expansion',
  shortDescription: 'A directional move on configurable relative volume.',
  minimumCandles: ({ settings }) => settings.volumeExpansion.lookbackBars + 1,
  evaluateAt: (candles, index, { minMovePercent, settings }) => {
    const candle = candles[index];
    const {
      lookbackBars,
      volumeMultiplier,
      minCoveragePercent,
    } = settings.volumeExpansion;
    const prior = candles.slice(index - lookbackBars, index);
    const populatedVolumes = prior
      .map((item) => item.volume)
      .filter((volume) => Number.isFinite(volume) && volume > 0);
    const requiredVolumeBars = Math.ceil(prior.length * (minCoveragePercent / 100));
    if (populatedVolumes.length < requiredVolumeBars) return null;
    const averageVolume = populatedVolumes.reduce((sum, volume) => sum + volume, 0)
      / populatedVolumes.length;
    const change = candleBodyChange(candle);
    if (
      change < minMovePercent
      || !Number.isFinite(candle.volume)
      || candle.volume <= 0
      || candle.volume < averageVolume * volumeMultiplier
    ) return null;

    return directionalMatch(
      candle,
      change,
      'volume-expansion',
      `Bullish Volume Expansion (+${change.toFixed(2)}%, ${volumeMultiplier}× volume over ${lookbackBars} bars)`,
      `Bearish Volume Expansion (-${change.toFixed(2)}%, ${volumeMultiplier}× volume over ${lookbackBars} bars)`,
    );
  },
} satisfies PatternDefinition<'volume-expansion'>;

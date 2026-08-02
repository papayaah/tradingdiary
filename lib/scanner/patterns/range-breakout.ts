import { candleBodyChange, type PatternDefinition } from './types';

export const rangeBreakoutPattern = {
  id: 'range-breakout',
  name: 'Range Breakout',
  shortDescription: 'Price closes beyond the configured prior range.',
  minimumCandles: ({ settings }) => settings.rangeBreakout.lookbackBars + 1,
  evaluateAt: (candles, index, { minMovePercent, settings }) => {
    const candle = candles[index];
    const {
      lookbackBars,
      minBreakoutPercent,
      volumeConfirmationMultiplier,
    } = settings.rangeBreakout;
    const prior = candles.slice(index - lookbackBars, index);
    const priorHigh = Math.max(...prior.map((item) => item.high));
    const priorLow = Math.min(...prior.map((item) => item.low));
    const change = candleBodyChange(candle);
    const bullishBreakoutPercent = priorHigh <= 0
      ? 0
      : ((candle.close - priorHigh) / priorHigh) * 100;
    const bearishBreakoutPercent = priorLow <= 0
      ? 0
      : ((priorLow - candle.close) / priorLow) * 100;
    const volumeConfirmed = (() => {
      if (volumeConfirmationMultiplier === null) return true;
      const populatedVolumes = prior
        .map((item) => item.volume)
        .filter((volume) => Number.isFinite(volume) && volume > 0);
      if (populatedVolumes.length < Math.ceil(prior.length * 0.8)) return false;
      const averageVolume = populatedVolumes.reduce((sum, volume) => sum + volume, 0)
        / populatedVolumes.length;
      return candle.volume > 0
        && candle.volume >= averageVolume * volumeConfirmationMultiplier;
    })();

    if (
      change >= minMovePercent
      && bullishBreakoutPercent >= minBreakoutPercent
      && bullishBreakoutPercent > 0
      && volumeConfirmed
    ) {
      return {
        time: candle.time,
        type: 'bullish',
        change,
        message: `Bullish ${lookbackBars}-Candle Range Breakout (+${bullishBreakoutPercent.toFixed(2)}% beyond range)`,
        patternId: 'range-breakout',
      };
    }
    if (
      change >= minMovePercent
      && bearishBreakoutPercent >= minBreakoutPercent
      && bearishBreakoutPercent > 0
      && volumeConfirmed
    ) {
      return {
        time: candle.time,
        type: 'bearish',
        change,
        message: `Bearish ${lookbackBars}-Candle Range Breakdown (-${bearishBreakoutPercent.toFixed(2)}% beyond range)`,
        patternId: 'range-breakout',
      };
    }
    return null;
  },
} satisfies PatternDefinition<'range-breakout'>;

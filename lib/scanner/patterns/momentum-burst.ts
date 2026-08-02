import {
  candleBodyChange,
  directionalMatch,
  type PatternDefinition,
} from './types';

export const momentumBurstPattern = {
  id: 'momentum-burst',
  name: 'Momentum Burst',
  shortDescription: 'A large candle body compared with the recent average.',
  minimumCandles: ({ settings }) => settings.momentumBurst.lookbackBars + 1,
  evaluateAt: (candles, index, { minMovePercent, settings }) => {
    const candle = candles[index];
    const { lookbackBars, bodyMultiplier } = settings.momentumBurst;
    const prior = candles.slice(index - lookbackBars, index);
    const averageBody = prior.reduce((sum, item) => sum + candleBodyChange(item), 0) / prior.length;
    const change = candleBodyChange(candle);
    if (change < minMovePercent || averageBody <= 0 || change < averageBody * bodyMultiplier) return null;

    return directionalMatch(
      candle,
      change,
      'momentum-burst',
      `Bullish Momentum Burst (+${change.toFixed(2)}%, ${bodyMultiplier}× body over ${lookbackBars} bars)`,
      `Bearish Momentum Burst (-${change.toFixed(2)}%, ${bodyMultiplier}× body over ${lookbackBars} bars)`,
    );
  },
} satisfies PatternDefinition<'momentum-burst'>;

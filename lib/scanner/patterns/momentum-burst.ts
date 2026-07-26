import {
  candleBodyChange,
  directionalMatch,
  type PatternDefinition,
} from './types';

export const momentumBurstPattern = {
  id: 'momentum-burst',
  name: 'Momentum Burst',
  shortDescription: 'A large candle body compared with the recent average.',
  minimumCandles: () => 11,
  evaluateAt: (candles, index, { minMovePercent }) => {
    const candle = candles[index];
    const prior = candles.slice(index - 10, index);
    const averageBody = prior.reduce((sum, item) => sum + candleBodyChange(item), 0) / prior.length;
    const change = candleBodyChange(candle);
    if (change < minMovePercent || averageBody <= 0 || change < averageBody * 1.8) return null;

    return directionalMatch(
      candle,
      change,
      'momentum-burst',
      `Bullish Momentum Burst (+${change.toFixed(2)}%, 1.8× body)`,
      `Bearish Momentum Burst (-${change.toFixed(2)}%, 1.8× body)`,
    );
  },
} satisfies PatternDefinition<'momentum-burst'>;

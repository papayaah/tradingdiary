import { candleBodyChange, type PatternDefinition } from './types';

export const rangeBreakoutPattern = {
  id: 'range-breakout',
  name: 'Range Breakout',
  shortDescription: 'Price closes beyond the prior 10-candle high or low.',
  minimumCandles: () => 11,
  evaluateAt: (candles, index, { minMovePercent }) => {
    const candle = candles[index];
    const prior = candles.slice(index - 10, index);
    const priorHigh = Math.max(...prior.map((item) => item.high));
    const priorLow = Math.min(...prior.map((item) => item.low));
    const change = candleBodyChange(candle);

    if (change >= minMovePercent && candle.close > priorHigh) {
      return {
        time: candle.time,
        type: 'bullish',
        change,
        message: `Bullish 10-Candle Range Breakout (+${change.toFixed(2)}%)`,
        patternId: 'range-breakout',
      };
    }
    if (change >= minMovePercent && candle.close < priorLow) {
      return {
        time: candle.time,
        type: 'bearish',
        change,
        message: `Bearish 10-Candle Range Breakdown (-${change.toFixed(2)}%)`,
        patternId: 'range-breakout',
      };
    }
    return null;
  },
} satisfies PatternDefinition<'range-breakout'>;

import { candleBodyChange, type PatternDefinition } from './types';

export const engulfingReversalPattern = {
  id: 'engulfing-reversal',
  name: 'Engulfing Reversal',
  shortDescription: 'An opposite candle body completely engulfs the prior body.',
  minimumCandles: () => 2,
  evaluateAt: (candles, index, { minMovePercent }) => {
    const candle = candles[index];
    const previous = candles[index - 1];
    const change = candleBodyChange(candle);
    const bullish = previous.close < previous.open
      && candle.close > candle.open
      && candle.open <= previous.close
      && candle.close >= previous.open;
    const bearish = previous.close > previous.open
      && candle.close < candle.open
      && candle.open >= previous.close
      && candle.close <= previous.open;

    if (change >= minMovePercent && bullish) {
      return {
        time: candle.time,
        type: 'bullish',
        change,
        message: `Bullish Engulfing Reversal (+${change.toFixed(2)}%)`,
        patternId: 'engulfing-reversal',
      };
    }
    if (change >= minMovePercent && bearish) {
      return {
        time: candle.time,
        type: 'bearish',
        change,
        message: `Bearish Engulfing Reversal (-${change.toFixed(2)}%)`,
        patternId: 'engulfing-reversal',
      };
    }
    return null;
  },
} satisfies PatternDefinition<'engulfing-reversal'>;

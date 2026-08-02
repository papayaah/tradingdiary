import { candleBodyChange, type PatternDefinition } from './types';

export const engulfingReversalPattern = {
  id: 'engulfing-reversal',
  name: 'Engulfing Reversal',
  shortDescription: 'An opposite candle body completely engulfs the prior body.',
  minimumCandles: () => 2,
  evaluateAt: (candles, index, { minMovePercent, settings }) => {
    const candle = candles[index];
    const previous = candles[index - 1];
    const change = candleBodyChange(candle);
    const previousChange = candleBodyChange(previous);
    const bodyRatio = previousChange > 0 ? change / previousChange : 0;
    const { minPriorBodyPercent, minBodyRatio } = settings.engulfingReversal;
    const bullish = previous.close < previous.open
      && candle.close > candle.open
      && candle.open <= previous.close
      && candle.close >= previous.open;
    const bearish = previous.close > previous.open
      && candle.close < candle.open
      && candle.open >= previous.close
      && candle.close <= previous.open;

    const meetsStrength = previousChange >= minPriorBodyPercent
      && bodyRatio >= minBodyRatio;

    if (change >= minMovePercent && bullish && meetsStrength) {
      return {
        time: candle.time,
        type: 'bullish',
        change,
        message: `Bullish Engulfing Reversal (+${change.toFixed(2)}%, ${bodyRatio.toFixed(1)}× prior body)`,
        patternId: 'engulfing-reversal',
      };
    }
    if (change >= minMovePercent && bearish && meetsStrength) {
      return {
        time: candle.time,
        type: 'bearish',
        change,
        message: `Bearish Engulfing Reversal (-${change.toFixed(2)}%, ${bodyRatio.toFixed(1)}× prior body)`,
        patternId: 'engulfing-reversal',
      };
    }
    return null;
  },
} satisfies PatternDefinition<'engulfing-reversal'>;

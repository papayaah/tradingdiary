import type { PatternDefinition } from './types';

export const consecutivePattern = {
  id: 'consecutive',
  name: 'Consecutive Move',
  shortDescription: 'Same-color candles closing progressively higher or lower.',
  minimumCandles: ({ requiredCount }) => requiredCount,
  evaluateAt: (candles, index, { minMovePercent, requiredCount }) => {
    const chunk = candles.slice(index - requiredCount + 1, index + 1);
    const allGreen = chunk.every((candle) => candle.close > candle.open);
    const allRed = chunk.every((candle) => candle.close < candle.open);
    const ascending = chunk.every((candle, chunkIndex) =>
      chunkIndex === 0 || candle.close > chunk[chunkIndex - 1].close);
    const descending = chunk.every((candle, chunkIndex) =>
      chunkIndex === 0 || candle.close < chunk[chunkIndex - 1].close);
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    const change = Math.abs((last.close - first.open) / first.open) * 100;

    if (allGreen && ascending && change >= minMovePercent) {
      return {
        time: last.time,
        type: 'bullish',
        change,
        message: `Bullish ${requiredCount}-Candle Move (+${change.toFixed(2)}%)`,
        patternId: 'consecutive',
      };
    }
    if (allRed && descending && change >= minMovePercent) {
      return {
        time: last.time,
        type: 'bearish',
        change,
        message: `Bearish ${requiredCount}-Candle Move (-${change.toFixed(2)}%)`,
        patternId: 'consecutive',
      };
    }
    return null;
  },
} satisfies PatternDefinition<'consecutive'>;

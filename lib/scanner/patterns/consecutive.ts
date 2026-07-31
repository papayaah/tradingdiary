import {
  candleBodyChange,
  candleBodyOverlapPercent,
  type PatternDefinition,
} from './types';

export const consecutivePattern = {
  id: 'consecutive',
  name: 'Consecutive Move',
  shortDescription: 'Same-color candles whose bodies each meet the minimum size.',
  minimumCandles: ({ requiredCount }) => requiredCount,
  evaluateAt: (
    candles,
    index,
    { minMovePercent, requiredCount, maxBodyOverlapPercent },
  ) => {
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
    const everyBodyMeetsMinimum = chunk.every(
      (candle) => candleBodyChange(candle) >= minMovePercent,
    );
    const everyBodyMeetsOverlapLimit = chunk.every(
      (candle, chunkIndex) =>
        chunkIndex === 0
        || candleBodyOverlapPercent(chunk[chunkIndex - 1], candle)
          <= maxBodyOverlapPercent,
    );

    if (
      allGreen
      && ascending
      && everyBodyMeetsMinimum
      && everyBodyMeetsOverlapLimit
    ) {
      return {
        time: last.time,
        type: 'bullish',
        change,
        message: `Bullish ${requiredCount}-Candle Move (+${change.toFixed(2)}%)`,
        patternId: 'consecutive',
      };
    }
    if (
      allRed
      && descending
      && everyBodyMeetsMinimum
      && everyBodyMeetsOverlapLimit
    ) {
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

import { candleBodyChange, type PatternDefinition } from './types';

const BODY_BASELINE_LOOKBACK = 20;
const MIN_PER_CANDLE_THRESHOLD_SHARE = 0.35;
const MIN_RECENT_MEDIAN_BODY_SHARE = 0.30;

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

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
    const recentBodies = candles
      .slice(Math.max(0, index - BODY_BASELINE_LOOKBACK), index)
      .map(candleBodyChange)
      .filter((body) => Number.isFinite(body) && body > 0);
    const recentMedianBody = median(recentBodies);
    const minimumLatestBody = Math.max(
      (minMovePercent / requiredCount) * MIN_PER_CANDLE_THRESHOLD_SHARE,
      recentMedianBody * MIN_RECENT_MEDIAN_BODY_SHARE,
    );
    const latestBodyIsMeaningful = candleBodyChange(last) >= minimumLatestBody;

    if (allGreen && ascending && change >= minMovePercent && latestBodyIsMeaningful) {
      return {
        time: last.time,
        type: 'bullish',
        change,
        message: `Bullish ${requiredCount}-Candle Move (+${change.toFixed(2)}%)`,
        patternId: 'consecutive',
      };
    }
    if (allRed && descending && change >= minMovePercent && latestBodyIsMeaningful) {
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

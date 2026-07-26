// ============================================================================
// Pattern detector — server-safe, environment-independent.
//
// No React, DOM, browser storage, audio, or notification dependencies, so the
// scanner worker and unit tests can both import it. See
// docs/specs/server-side-market-scanner.md ("Pattern evaluation").
//
// Pattern DEFINITIONS must not change without bumping PATTERN_VERSION: alert
// deduplication keys on (watch_id, candle_time, direction, pattern_version),
// so a definition change with the same version would make historical dedup
// ambiguous.
// ============================================================================

/**
 * Algorithm version stored alongside every alert. Bump this whenever the
 * detection logic below changes in a way that could alter which candles match.
 */
export const PATTERN_VERSION = 1;

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PatternMatch {
  time: number;
  type: 'bullish' | 'bearish';
  change: number;
  message: string;
  patternId: PatternId;
}

export const PATTERN_PRESETS = [
  {
    id: 'consecutive',
    name: 'Consecutive Move',
    shortDescription: 'Same-color candles closing progressively higher or lower.',
  },
  {
    id: 'momentum-burst',
    name: 'Momentum Burst',
    shortDescription: 'A large candle body compared with the recent average.',
  },
  {
    id: 'range-breakout',
    name: 'Range Breakout',
    shortDescription: 'Price closes beyond the prior 10-candle high or low.',
  },
  {
    id: 'volume-expansion',
    name: 'Volume Expansion',
    shortDescription: 'A directional move on at least 2× recent average volume.',
  },
  {
    id: 'engulfing-reversal',
    name: 'Engulfing Reversal',
    shortDescription: 'An opposite candle body completely engulfs the prior body.',
  },
] as const;

export type PatternId = (typeof PATTERN_PRESETS)[number]['id'];
export const DEFAULT_PATTERN_ID: PatternId = 'consecutive';

export const isPatternId = (value: unknown): value is PatternId =>
  typeof value === 'string' && PATTERN_PRESETS.some((preset) => preset.id === value);

const candleBodyChange = (candle: Candle) =>
  candle.open === 0 ? 0 : Math.abs((candle.close - candle.open) / candle.open) * 100;

const directionalMatch = (
  candle: Candle,
  change: number,
  patternId: PatternId,
  bullishMessage: string,
  bearishMessage: string,
): PatternMatch | null => {
  if (candle.close > candle.open) {
    return { time: candle.time, type: 'bullish', change, message: bullishMessage, patternId };
  }
  if (candle.close < candle.open) {
    return { time: candle.time, type: 'bearish', change, message: bearishMessage, patternId };
  }
  return null;
};

export const scanAllPatterns = (
  candles: Candle[],
  minMovePercent: number,
  requiredCount: number = 3,
  patternId: PatternId = DEFAULT_PATTERN_ID,
): PatternMatch[] => {
  const matches: PatternMatch[] = [];
  const count = Math.max(2, Math.min(10, requiredCount));
  const minimumCandles = patternId === 'consecutive'
    ? count
    : patternId === 'engulfing-reversal'
      ? 2
      : 11;
  if (candles.length < minimumCandles) return matches;

  for (let index = minimumCandles - 1; index < candles.length; index++) {
    const candle = candles[index];

    if (patternId === 'momentum-burst') {
      const prior = candles.slice(index - 10, index);
      const averageBody = prior.reduce((sum, item) => sum + candleBodyChange(item), 0) / prior.length;
      const change = candleBodyChange(candle);
      if (change >= minMovePercent && averageBody > 0 && change >= averageBody * 1.8) {
        const match = directionalMatch(
          candle,
          change,
          patternId,
          `Bullish Momentum Burst (+${change.toFixed(2)}%, 1.8× body)`,
          `Bearish Momentum Burst (-${change.toFixed(2)}%, 1.8× body)`,
        );
        if (match) matches.push(match);
      }
      continue;
    }

    if (patternId === 'range-breakout') {
      const prior = candles.slice(index - 10, index);
      const priorHigh = Math.max(...prior.map((item) => item.high));
      const priorLow = Math.min(...prior.map((item) => item.low));
      const change = candleBodyChange(candle);
      if (change >= minMovePercent && candle.close > priorHigh) {
        matches.push({
          time: candle.time,
          type: 'bullish',
          change,
          message: `Bullish 10-Candle Range Breakout (+${change.toFixed(2)}%)`,
          patternId,
        });
      } else if (change >= minMovePercent && candle.close < priorLow) {
        matches.push({
          time: candle.time,
          type: 'bearish',
          change,
          message: `Bearish 10-Candle Range Breakdown (-${change.toFixed(2)}%)`,
          patternId,
        });
      }
      continue;
    }

    if (patternId === 'volume-expansion') {
      const prior = candles.slice(index - 10, index);
      const averageVolume = prior.reduce((sum, item) => sum + item.volume, 0) / prior.length;
      const change = candleBodyChange(candle);
      if (change >= minMovePercent && averageVolume > 0 && candle.volume >= averageVolume * 2) {
        const match = directionalMatch(
          candle,
          change,
          patternId,
          `Bullish Volume Expansion (+${change.toFixed(2)}%, 2× volume)`,
          `Bearish Volume Expansion (-${change.toFixed(2)}%, 2× volume)`,
        );
        if (match) matches.push(match);
      }
      continue;
    }

    if (patternId === 'engulfing-reversal') {
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
        matches.push({
          time: candle.time,
          type: 'bullish',
          change,
          message: `Bullish Engulfing Reversal (+${change.toFixed(2)}%)`,
          patternId,
        });
      } else if (change >= minMovePercent && bearish) {
        matches.push({
          time: candle.time,
          type: 'bearish',
          change,
          message: `Bearish Engulfing Reversal (-${change.toFixed(2)}%)`,
          patternId,
        });
      }
      continue;
    }

    const chunk = candles.slice(index - count + 1, index + 1);
    const allGreen = chunk.every((c) => c.close > c.open);
    const allRed = chunk.every((c) => c.close < c.open);
    const ascending = chunk.every((c, i) => i === 0 || c.close > chunk[i - 1].close);
    const descending = chunk.every((c, i) => i === 0 || c.close < chunk[i - 1].close);

    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    const change = Math.abs((last.close - first.open) / first.open) * 100;

    if (allGreen && ascending && change >= minMovePercent) {
      matches.push({
        time: last.time,
        type: 'bullish',
        change,
        message: `Bullish ${count}-Candle Move (+${change.toFixed(2)}%)`,
        patternId,
      });
    } else if (allRed && descending && change >= minMovePercent) {
      matches.push({
        time: last.time,
        type: 'bearish',
        change,
        message: `Bearish ${count}-Candle Move (-${change.toFixed(2)}%)`,
        patternId,
      });
    }
  }

  return matches;
};

export const detectPattern = (
  candles: Candle[],
  minMovePercent: number,
  requiredCount: number = 3,
  patternId: PatternId = DEFAULT_PATTERN_ID,
) => {
  const count = Math.max(2, Math.min(10, requiredCount));
  const minimumCandles = patternId === 'consecutive'
    ? count
    : patternId === 'engulfing-reversal'
      ? 2
      : 11;
  if (candles.length < minimumCandles) {
    return {
      matched: 'none' as const,
      message: `Insufficient candles (${candles.length}/${minimumCandles})`,
    };
  }

  const matches = scanAllPatterns(candles, minMovePercent, count, patternId);
  if (matches.length === 0) {
    return {
      matched: 'none' as const,
      message: 'No matching pattern found',
    };
  }

  const latestMatch = matches[matches.length - 1];
  if (latestMatch.time !== candles[candles.length - 1].time) {
    return {
      matched: 'none' as const,
      message: 'Latest pattern setup is too old',
    };
  }

  return {
    matched: latestMatch.type,
    message: latestMatch.message,
    time: latestMatch.time,
  };
};

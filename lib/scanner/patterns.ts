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
}

export const scanAllPatterns = (
  candles: Candle[],
  minMovePercent: number,
  requiredCount: number = 3,
): PatternMatch[] => {
  const matches: PatternMatch[] = [];
  const count = Math.max(2, Math.min(10, requiredCount));
  if (candles.length < count) return matches;

  for (let index = count - 1; index < candles.length; index++) {
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
      });
    } else if (allRed && descending && change >= minMovePercent) {
      matches.push({
        time: last.time,
        type: 'bearish',
        change,
        message: `Bearish ${count}-Candle Move (-${change.toFixed(2)}%)`,
      });
    }
  }

  return matches;
};

export const detectPattern = (
  candles: Candle[],
  minMovePercent: number,
  requiredCount: number = 3,
) => {
  const count = Math.max(2, Math.min(10, requiredCount));
  if (candles.length < count) {
    return {
      matched: 'none' as const,
      message: `Insufficient candles (${candles.length}/${count})`,
    };
  }

  const matches = scanAllPatterns(candles, minMovePercent, count);
  if (matches.length === 0) {
    return {
      matched: 'none' as const,
      message: 'No extended move patterns found',
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
    message: `${latestMatch.type === 'bullish' ? 'Bullish' : 'Bearish'} ${count}-Candle Move (${
      latestMatch.type === 'bullish' ? '+' : '-'
    }${latestMatch.change.toFixed(2)}%)`,
    time: latestMatch.time,
  };
};

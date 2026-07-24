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
): PatternMatch[] => {
  const matches: PatternMatch[] = [];
  if (candles.length < 3) return matches;

  for (let index = 2; index < candles.length; index++) {
    const first = candles[index - 2];
    const second = candles[index - 1];
    const third = candles[index];

    const allGreen =
      first.close > first.open
      && second.close > second.open
      && third.close > third.open;
    const allRed =
      first.close < first.open
      && second.close < second.open
      && third.close < third.open;
    const ascending = third.close > second.close && second.close > first.close;
    const descending = third.close < second.close && second.close < first.close;
    const change = Math.abs((third.close - first.open) / first.open) * 100;

    if (allGreen && ascending && change >= minMovePercent) {
      matches.push({
        time: third.time,
        type: 'bullish',
        change,
        message: `Bullish Setup (+${change.toFixed(2)}%)`,
      });
    } else if (allRed && descending && change >= minMovePercent) {
      matches.push({
        time: third.time,
        type: 'bearish',
        change,
        message: `Bearish Setup (-${change.toFixed(2)}%)`,
      });
    }
  }

  return matches;
};

export const detectPattern = (
  candles: Candle[],
  minMovePercent: number,
) => {
  if (candles.length < 3) {
    return {
      matched: 'none' as const,
      message: `Insufficient candles (${candles.length}/3)`,
    };
  }

  const matches = scanAllPatterns(candles, minMovePercent);
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
    message: `${latestMatch.type === 'bullish' ? 'Bullish' : 'Bearish'} Extended Move. Total change: ${
      latestMatch.type === 'bullish' ? '+' : '-'
    }${latestMatch.change.toFixed(2)}% (Min: ${minMovePercent}%)`,
    time: latestMatch.time,
  };
};

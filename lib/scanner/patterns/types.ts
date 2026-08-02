import type { PatternSettings } from './settings';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PatternMatch<Id extends string = string> {
  time: number;
  type: 'bullish' | 'bearish';
  change: number;
  message: string;
  patternId: Id;
}

export interface PatternContext {
  minMovePercent: number;
  requiredCount: number;
  maxBodyOverlapPercent: number;
  settings: PatternSettings;
}

export interface PatternDefinition<Id extends string = string> {
  id: Id;
  name: string;
  shortDescription: string;
  minimumCandles: (context: PatternContext) => number;
  evaluateAt: (
    candles: Candle[],
    index: number,
    context: PatternContext,
  ) => PatternMatch<Id> | null;
}

export const candleBodyChange = (candle: Candle) =>
  candle.open === 0 ? 0 : Math.abs((candle.close - candle.open) / candle.open) * 100;

export const candleBodyOverlapPercent = (previous: Candle, current: Candle) => {
  const previousLow = Math.min(previous.open, previous.close);
  const previousHigh = Math.max(previous.open, previous.close);
  const currentLow = Math.min(current.open, current.close);
  const currentHigh = Math.max(current.open, current.close);
  const overlap = Math.max(
    0,
    Math.min(previousHigh, currentHigh) - Math.max(previousLow, currentLow),
  );
  const smallerBody = Math.min(
    previousHigh - previousLow,
    currentHigh - currentLow,
  );
  if (smallerBody <= 0) return 0;
  return Math.min(100, (overlap / smallerBody) * 100);
};

export const directionalMatch = <Id extends string>(
  candle: Candle,
  change: number,
  patternId: Id,
  bullishMessage: string,
  bearishMessage: string,
): PatternMatch<Id> | null => {
  if (candle.close > candle.open) {
    return { time: candle.time, type: 'bullish', change, message: bullishMessage, patternId };
  }
  if (candle.close < candle.open) {
    return { time: candle.time, type: 'bearish', change, message: bearishMessage, patternId };
  }
  return null;
};

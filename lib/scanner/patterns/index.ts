// Server-safe pattern engine. Individual detectors live in their own modules;
// adding a preset only requires a new definition and one registry entry.

import {
  DEFAULT_PATTERN_ID,
  getPatternDefinition,
  isPatternId,
  PATTERN_DEFINITIONS,
  type PatternId,
} from './registry';
import type { Candle, PatternContext, PatternMatch } from './types';

/**
 * Algorithm version stored alongside every alert. Bump this whenever detector
 * behavior changes in a way that could alter which candles match.
 */
export const PATTERN_VERSION = 4;

export const PATTERN_PRESETS = PATTERN_DEFINITIONS.map(
  ({ id, name, shortDescription }) => ({ id, name, shortDescription }),
);

const createContext = (
  minMovePercent: number,
  requiredCount: number,
  maxBodyOverlapPercent: number,
): PatternContext => ({
  minMovePercent,
  requiredCount: Math.max(2, Math.min(10, requiredCount)),
  maxBodyOverlapPercent: Math.max(0, Math.min(100, maxBodyOverlapPercent)),
});

export const scanAllPatterns = (
  candles: Candle[],
  minMovePercent: number,
  requiredCount: number = 3,
  patternId: PatternId = DEFAULT_PATTERN_ID,
  maxBodyOverlapPercent: number = 100,
): PatternMatch<PatternId>[] => {
  const definition = getPatternDefinition(patternId);
  const context = createContext(
    minMovePercent,
    requiredCount,
    maxBodyOverlapPercent,
  );
  const minimumCandles = definition.minimumCandles(context);
  const matches: PatternMatch<PatternId>[] = [];
  if (candles.length < minimumCandles) return matches;

  for (let index = minimumCandles - 1; index < candles.length; index++) {
    const match = definition.evaluateAt(candles, index, context);
    if (match) matches.push(match);
  }
  return matches;
};

export const detectPattern = (
  candles: Candle[],
  minMovePercent: number,
  requiredCount: number = 3,
  patternId: PatternId = DEFAULT_PATTERN_ID,
  maxBodyOverlapPercent: number = 100,
) => {
  const definition = getPatternDefinition(patternId);
  const context = createContext(
    minMovePercent,
    requiredCount,
    maxBodyOverlapPercent,
  );
  const minimumCandles = definition.minimumCandles(context);
  if (candles.length < minimumCandles) {
    return {
      matched: 'none' as const,
      message: `Insufficient candles (${candles.length}/${minimumCandles})`,
    };
  }

  const matches = scanAllPatterns(
    candles,
    minMovePercent,
    context.requiredCount,
    patternId,
    context.maxBodyOverlapPercent,
  );
  if (matches.length === 0) {
    return { matched: 'none' as const, message: 'No matching pattern found' };
  }

  const latestMatch = matches[matches.length - 1];
  if (latestMatch.time !== candles[candles.length - 1].time) {
    return { matched: 'none' as const, message: 'Latest pattern setup is too old' };
  }

  return {
    matched: latestMatch.type,
    message: latestMatch.message,
    time: latestMatch.time,
  };
};

export {
  DEFAULT_PATTERN_ID,
  getPatternDefinition,
  isPatternId,
  PATTERN_DEFINITIONS,
};
export type { Candle, PatternContext, PatternDefinition, PatternMatch } from './types';
export type { PatternId } from './registry';

import { consecutivePattern } from './consecutive';
import { engulfingReversalPattern } from './engulfing-reversal';
import { momentumBurstPattern } from './momentum-burst';
import { rangeBreakoutPattern } from './range-breakout';
import { volumeExpansionPattern } from './volume-expansion';
import type { PatternDefinition } from './types';

export const PATTERN_DEFINITIONS = [
  consecutivePattern,
  momentumBurstPattern,
  rangeBreakoutPattern,
  volumeExpansionPattern,
  engulfingReversalPattern,
] as const;

export type PatternId = (typeof PATTERN_DEFINITIONS)[number]['id'];

export const DEFAULT_PATTERN_ID: PatternId = 'consecutive';

export const isPatternId = (value: unknown): value is PatternId =>
  typeof value === 'string'
  && PATTERN_DEFINITIONS.some((definition) => definition.id === value);

export const getPatternDefinition = (patternId: PatternId): PatternDefinition<PatternId> =>
  PATTERN_DEFINITIONS.find((definition) => definition.id === patternId) as PatternDefinition<PatternId>;

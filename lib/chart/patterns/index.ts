import { CandleData } from './pivots';
import { detectCupAndHandle, CupAndHandleResult } from './cupAndHandle';
import { detectHeadAndShoulders, HeadAndShouldersResult } from './headAndShoulders';
import { detectDoubleTopBottom, DoubleTopBottomResult } from './doubleTopBottom';

export * from './pivots';
export * from './cupAndHandle';
export * from './headAndShoulders';
export * from './doubleTopBottom';
export * from './marketStructure';

export type DetectedPattern = CupAndHandleResult | HeadAndShouldersResult | DoubleTopBottomResult;

export interface PatternScanSummary {
  patterns: DetectedPattern[];
  totalDetected: number;
}

export function detectAllPatterns(candles: CandleData[]): PatternScanSummary {
  if (!candles || candles.length < 15) {
    return { patterns: [], totalDetected: 0 };
  }

  const cups = detectCupAndHandle(candles);
  const headShoulders = detectHeadAndShoulders(candles);
  const doubleTopsBottoms = detectDoubleTopBottom(candles);

  const all: DetectedPattern[] = [...cups, ...headShoulders, ...doubleTopsBottoms];

  // Sort by confidence descending
  all.sort((a, b) => b.confidence - a.confidence);

  return {
    patterns: all,
    totalDetected: all.length,
  };
}

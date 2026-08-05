export interface MomentumBurstPreview {
  baselineBodies: number[];
  averageBody: number;
  relativeThreshold: number;
  requiredSignalBody: number;
  signalBody: number;
  passesAbsoluteMinimum: boolean;
  passesRelativeExpansion: boolean;
}

const BASELINE_BODY_MULTIPLIERS = [1.12, 1.48, 1.24] as const;

/**
 * Builds a stable illustrative Momentum Burst example from the real detector
 * formula. The three visible prior candles represent the configured lookback
 * average; the detector itself still evaluates every bar in that lookback.
 */
export function buildMomentumBurstPreview(
  minMovePercent: number,
  bodyMultiplier: number,
  passes: boolean,
): MomentumBurstPreview {
  const baselineBodies = BASELINE_BODY_MULTIPLIERS.map(
    (multiplier) => minMovePercent * multiplier,
  );
  const averageBody = baselineBodies.reduce((sum, body) => sum + body, 0)
    / baselineBodies.length;
  const relativeThreshold = averageBody * bodyMultiplier;
  const requiredSignalBody = Math.max(minMovePercent, relativeThreshold);
  const signalBody = requiredSignalBody * (passes ? 1.08 : 0.75);

  return {
    baselineBodies,
    averageBody,
    relativeThreshold,
    requiredSignalBody,
    signalBody,
    passesAbsoluteMinimum: signalBody >= minMovePercent,
    passesRelativeExpansion: signalBody >= relativeThreshold,
  };
}

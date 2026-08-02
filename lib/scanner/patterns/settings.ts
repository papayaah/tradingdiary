export interface RangeBreakoutSettings {
  lookbackBars: number;
  minBreakoutPercent: number;
  volumeConfirmationMultiplier: number | null;
}

export interface PatternSettings {
  rangeBreakout: RangeBreakoutSettings;
}

export const DEFAULT_PATTERN_SETTINGS: PatternSettings = {
  rangeBreakout: {
    lookbackBars: 10,
    minBreakoutPercent: 0,
    volumeConfirmationMultiplier: null,
  },
};
const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export const normalizePatternSettings = (input: unknown): PatternSettings => {
  const root = input && typeof input === 'object'
    ? input as Record<string, unknown>
    : {};
  const rawRange = root.rangeBreakout && typeof root.rangeBreakout === 'object'
    ? root.rangeBreakout as Record<string, unknown>
    : {};
  const lookback = finiteNumber(rawRange.lookbackBars);
  const breakout = finiteNumber(rawRange.minBreakoutPercent);
  const volumeMultiplier = finiteNumber(rawRange.volumeConfirmationMultiplier);

  return {
    rangeBreakout: {
      lookbackBars: lookback === null
        ? DEFAULT_PATTERN_SETTINGS.rangeBreakout.lookbackBars
        : Math.max(5, Math.min(100, Math.round(lookback))),
      minBreakoutPercent: breakout === null
        ? DEFAULT_PATTERN_SETTINGS.rangeBreakout.minBreakoutPercent
        : Math.max(0, Math.min(5, breakout)),
      volumeConfirmationMultiplier: volumeMultiplier === null
        ? null
        : Math.max(1, Math.min(10, volumeMultiplier)),
    },
  };
};

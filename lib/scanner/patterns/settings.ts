export interface RangeBreakoutSettings {
  lookbackBars: number;
  minBreakoutPercent: number;
  volumeConfirmationMultiplier: number | null;
}

export interface VolumeExpansionSettings {
  lookbackBars: number;
  volumeMultiplier: number;
  minCoveragePercent: number;
}

export interface MomentumBurstSettings {
  lookbackBars: number;
  bodyMultiplier: number;
}

export interface EngulfingReversalSettings {
  minPriorBodyPercent: number;
  minBodyRatio: number;
}

export interface PatternSettings {
  rangeBreakout: RangeBreakoutSettings;
  volumeExpansion: VolumeExpansionSettings;
  momentumBurst: MomentumBurstSettings;
  engulfingReversal: EngulfingReversalSettings;
}

export const DEFAULT_PATTERN_SETTINGS: PatternSettings = {
  rangeBreakout: {
    lookbackBars: 10,
    minBreakoutPercent: 0,
    volumeConfirmationMultiplier: null,
  },
  volumeExpansion: {
    lookbackBars: 10,
    volumeMultiplier: 2,
    minCoveragePercent: 80,
  },
  momentumBurst: {
    lookbackBars: 10,
    bodyMultiplier: 1.8,
  },
  engulfingReversal: {
    minPriorBodyPercent: 0,
    minBodyRatio: 1,
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
  const rawVolume = root.volumeExpansion && typeof root.volumeExpansion === 'object'
    ? root.volumeExpansion as Record<string, unknown>
    : {};
  const rawMomentum = root.momentumBurst && typeof root.momentumBurst === 'object'
    ? root.momentumBurst as Record<string, unknown>
    : {};
  const rawEngulfing = root.engulfingReversal && typeof root.engulfingReversal === 'object'
    ? root.engulfingReversal as Record<string, unknown>
    : {};
  const lookback = finiteNumber(rawRange.lookbackBars);
  const breakout = finiteNumber(rawRange.minBreakoutPercent);
  const volumeMultiplier = finiteNumber(rawRange.volumeConfirmationMultiplier);
  const volumeLookback = finiteNumber(rawVolume.lookbackBars);
  const expansionMultiplier = finiteNumber(rawVolume.volumeMultiplier);
  const minCoveragePercent = finiteNumber(rawVolume.minCoveragePercent);
  const momentumLookback = finiteNumber(rawMomentum.lookbackBars);
  const bodyMultiplier = finiteNumber(rawMomentum.bodyMultiplier);
  const minPriorBodyPercent = finiteNumber(rawEngulfing.minPriorBodyPercent);
  const minBodyRatio = finiteNumber(rawEngulfing.minBodyRatio);

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
    volumeExpansion: {
      lookbackBars: volumeLookback === null
        ? DEFAULT_PATTERN_SETTINGS.volumeExpansion.lookbackBars
        : Math.max(5, Math.min(100, Math.round(volumeLookback))),
      volumeMultiplier: expansionMultiplier === null
        ? DEFAULT_PATTERN_SETTINGS.volumeExpansion.volumeMultiplier
        : Math.max(1, Math.min(5, expansionMultiplier)),
      minCoveragePercent: minCoveragePercent === null
        ? DEFAULT_PATTERN_SETTINGS.volumeExpansion.minCoveragePercent
        : Math.max(60, Math.min(100, Math.round(minCoveragePercent))),
    },
    momentumBurst: {
      lookbackBars: momentumLookback === null
        ? DEFAULT_PATTERN_SETTINGS.momentumBurst.lookbackBars
        : Math.max(5, Math.min(100, Math.round(momentumLookback))),
      bodyMultiplier: bodyMultiplier === null
        ? DEFAULT_PATTERN_SETTINGS.momentumBurst.bodyMultiplier
        : Math.max(1.1, Math.min(5, bodyMultiplier)),
    },
    engulfingReversal: {
      minPriorBodyPercent: minPriorBodyPercent === null
        ? DEFAULT_PATTERN_SETTINGS.engulfingReversal.minPriorBodyPercent
        : Math.max(0, Math.min(3, minPriorBodyPercent)),
      minBodyRatio: minBodyRatio === null
        ? DEFAULT_PATTERN_SETTINGS.engulfingReversal.minBodyRatio
        : Math.max(1, Math.min(3, minBodyRatio)),
    },
  };
};

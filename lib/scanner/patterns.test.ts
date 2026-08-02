import { describe, it, expect } from 'vitest';
import {
  detectPattern,
  DEFAULT_PATTERN_SETTINGS,
  normalizePatternSettings,
  PATTERN_DEFINITIONS,
  scanAllPatterns,
  PATTERN_VERSION,
  type Candle,
} from './patterns';

/**
 * Build an ascending (all-green) run of `n` candles ending at time `endTime`
 * (one unit apart), rising by `stepPct` of the running close each step.
 */
function greenRun(n: number, startOpen = 100, stepPct = 1, endTime = n): Candle[] {
  const candles: Candle[] = [];
  let prevClose = startOpen;
  for (let i = 0; i < n; i++) {
    const open = i === 0 ? startOpen : prevClose;
    const close = open * (1 + stepPct / 100);
    candles.push({ time: endTime - (n - 1 - i), open, high: close, low: open, close, volume: 1000 });
    prevClose = close;
  }
  return candles;
}

/** Mirror of greenRun but falling (all-red, descending). */
function redRun(n: number, startOpen = 100, stepPct = 1, endTime = n): Candle[] {
  const candles: Candle[] = [];
  let prevClose = startOpen;
  for (let i = 0; i < n; i++) {
    const open = i === 0 ? startOpen : prevClose;
    const close = open * (1 - stepPct / 100);
    candles.push({ time: endTime - (n - 1 - i), open, high: open, low: close, close, volume: 1000 });
    prevClose = close;
  }
  return candles;
}

describe('PATTERN_VERSION', () => {
  it('is a positive integer (dedup keys on it)', () => {
    expect(Number.isInteger(PATTERN_VERSION)).toBe(true);
    expect(PATTERN_VERSION).toBeGreaterThan(0);
  });
});

describe('detectPattern — threshold behavior', () => {
  it('does not match when any candle body is below the threshold', () => {
    const candles = greenRun(3, 100, 1);
    candles[1] = {
      ...candles[1],
      close: candles[1].open * 1.001,
      high: candles[1].open * 1.001,
    };
    // The overall first-open-to-last-close move is still well above 0.25%,
    // but the middle candle body is only 0.10%.
    const result = detectPattern(candles, 0.25, 3);
    expect(result.matched).toBe('none');
  });

  it('matches when every bullish candle body meets the threshold', () => {
    const candles = greenRun(3, 100, 0.3);
    const result = detectPattern(candles, 0.25, 3);
    expect(result.matched).toBe('bullish');
    expect(result.time).toBe(candles[candles.length - 1].time);
  });

  it('matches when every bearish candle body meets the threshold', () => {
    const candles = redRun(3, 100, 0.3);
    const result = detectPattern(candles, 0.25, 3);
    expect(result.matched).toBe('bearish');
  });
});

describe('detectPattern — body staircase overlap', () => {
  const overlappingGreen: Candle[] = [
    { time: 1, open: 100, high: 101.1, low: 99.9, close: 101, volume: 1000 },
    { time: 2, open: 100.5, high: 101.6, low: 100.4, close: 101.5, volume: 1000 },
    { time: 3, open: 101, high: 102.1, low: 100.9, close: 102, volume: 1000 },
  ];

  it('preserves the existing detector when overlap is unrestricted', () => {
    expect(
      detectPattern(overlappingGreen, 0.5, 3, 'consecutive', 100).matched,
    ).toBe('bullish');
  });

  it('rejects overlapping bodies in clean-staircase mode', () => {
    expect(
      detectPattern(overlappingGreen, 0.5, 3, 'consecutive', 0).matched,
    ).toBe('none');
  });

  it('accepts a clean bearish staircase with no body overlap', () => {
    expect(
      detectPattern(redRun(3, 100, 1), 0.5, 3, 'consecutive', 0).matched,
    ).toBe('bearish');
  });

  it('allows overlap only up to the configured percentage', () => {
    expect(
      detectPattern(overlappingGreen, 0.5, 3, 'consecutive', 49).matched,
    ).toBe('none');
    expect(
      detectPattern(overlappingGreen, 0.5, 3, 'consecutive', 50).matched,
    ).toBe('bullish');
  });
});

describe('detectPattern — qualify-later behavior', () => {
  it('a candle that did not qualify earlier qualifies once it crosses the threshold', () => {
    const firstTwo = greenRun(2, 100, 0.5, 2);
    const formingSmall: Candle = {
      time: 3,
      open: firstTwo[1].close,
      high: firstTwo[1].close * 1.001,
      low: firstTwo[1].close,
      close: firstTwo[1].close * 1.001,
      volume: 1000,
    };
    expect(detectPattern([...firstTwo, formingSmall], 0.25, 3).matched).toBe('none');

    const formingLarge: Candle = {
      ...formingSmall,
      high: firstTwo[1].close * 1.005,
      close: firstTwo[1].close * 1.005,
    };
    const result = detectPattern([...firstTwo, formingLarge], 0.25, 3);
    expect(result.matched).toBe('bullish');
  });

  it('waits when the newest candle is tiny, then qualifies as that same candle grows', () => {
    const firstTwo = redRun(2, 100, 1, 2);
    const formingTiny: Candle = {
      time: 3,
      open: firstTwo[1].close,
      high: firstTwo[1].close,
      low: firstTwo[1].close * 0.9999,
      close: firstTwo[1].close * 0.9999,
      volume: 1000,
    };

    expect(detectPattern([...firstTwo, formingTiny], 0.5, 3).matched).toBe('none');

    const formingStrong: Candle = {
      ...formingTiny,
      low: firstTwo[1].close * 0.994,
      close: firstTwo[1].close * 0.994,
    };

    expect(detectPattern([...firstTwo, formingStrong], 0.5, 3).matched).toBe('bearish');
  });
});

describe('detectPattern — staleness and guards', () => {
  it('reports "too old" when the qualifying setup is not the latest candle', () => {
    // A qualifying 3-green run, then a trailing non-conforming (red) candle.
    const run = greenRun(3, 100, 1, 3);
    const trailing: Candle = { time: 4, open: 110, high: 110, low: 104, close: 105, volume: 1000 };
    const result = detectPattern([...run, trailing], 0.5, 3);
    expect(result.matched).toBe('none');
    expect(result.message).toMatch(/too old/i);
  });

  it('reports insufficient candles when fewer than requiredCount', () => {
    const result = detectPattern(greenRun(2, 100, 1), 1, 3);
    expect(result.matched).toBe('none');
    expect(result.message).toMatch(/insufficient/i);
  });

  it('clamps requiredCount into [2, 10]', () => {
    const candles = greenRun(2, 100, 1);
    // requiredCount 1 is clamped up to 2, so a 2-candle green run can match.
    expect(detectPattern(candles, 1, 1).matched).toBe('bullish');
  });
});

describe('scanAllPatterns', () => {
  it('returns every qualifying window, not just the last', () => {
    // 4 green candles => two overlapping 3-candle windows, both qualifying.
    const candles = greenRun(4, 100, 1);
    const matches = scanAllPatterns(candles, 0.5, 3);
    expect(matches.length).toBe(2);
    expect(matches.every((m) => m.type === 'bullish')).toBe(true);
  });

  it('returns nothing when the window is mixed (not all green/red)', () => {
    const candles = greenRun(3, 100, 1);
    candles[1] = { ...candles[1], close: candles[1].open * 0.99, low: candles[1].open * 0.99 }; // make middle red
    expect(scanAllPatterns(candles, 0.1, 3)).toHaveLength(0);
  });
});

describe('selectable pattern presets', () => {
  const quietCandles = Array.from({ length: 10 }, (_, index): Candle => ({
    time: index + 1,
    open: 100,
    high: 100.2,
    low: 99.8,
    close: index % 2 === 0 ? 100.1 : 99.9,
    volume: 1000,
  }));

  it('registers every detector under a unique id', () => {
    const ids = PATTERN_DEFINITIONS.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'consecutive',
      'momentum-burst',
      'range-breakout',
      'volume-expansion',
      'engulfing-reversal',
    ]);
  });

  it('detects a momentum burst relative to recent candle bodies', () => {
    const burst: Candle = {
      time: 11,
      open: 100,
      high: 102.2,
      low: 99.9,
      close: 102,
      volume: 1200,
    };
    const result = detectPattern([...quietCandles, burst], 1, 3, 'momentum-burst');
    expect(result.matched).toBe('bullish');
    expect(result.message).toMatch(/momentum burst/i);
  });

  it('detects closes outside the prior 10-candle range', () => {
    const breakout: Candle = {
      time: 11,
      open: 100,
      high: 102.2,
      low: 99.9,
      close: 102,
      volume: 1200,
    };
    expect(detectPattern([...quietCandles, breakout], 1, 3, 'range-breakout').matched).toBe('bullish');
  });

  it('applies a configurable range-breakout lookback', () => {
    const breakout: Candle = {
      time: 11,
      open: 100,
      high: 102.2,
      low: 99.9,
      close: 102,
      volume: 1200,
    };
    const settings = {
      ...DEFAULT_PATTERN_SETTINGS,
      rangeBreakout: {
        ...DEFAULT_PATTERN_SETTINGS.rangeBreakout,
        lookbackBars: 5,
      },
    };

    expect(
      detectPattern(
        [...quietCandles.slice(-5), breakout],
        1,
        3,
        'range-breakout',
        100,
        settings,
      ).matched,
    ).toBe('bullish');
  });

  it('requires the configured close distance beyond the range', () => {
    const settings = {
      ...DEFAULT_PATTERN_SETTINGS,
      rangeBreakout: {
        ...DEFAULT_PATTERN_SETTINGS.rangeBreakout,
        minBreakoutPercent: 0.1,
      },
    };
    const barelyOutside: Candle = {
      time: 11,
      open: 99.5,
      high: 100.25,
      low: 99.4,
      close: 100.25,
      volume: 1200,
    };
    const clearlyOutside: Candle = {
      ...barelyOutside,
      high: 100.5,
      close: 100.5,
    };

    expect(detectPattern(
      [...quietCandles, barelyOutside],
      0.5,
      3,
      'range-breakout',
      100,
      settings,
    ).matched).toBe('none');
    expect(detectPattern(
      [...quietCandles, clearlyOutside],
      0.5,
      3,
      'range-breakout',
      100,
      settings,
    ).matched).toBe('bullish');
  });

  it('optionally requires relative-volume confirmation for breakouts', () => {
    const settings = {
      ...DEFAULT_PATTERN_SETTINGS,
      rangeBreakout: {
        ...DEFAULT_PATTERN_SETTINGS.rangeBreakout,
        volumeConfirmationMultiplier: 1.5,
      },
    };
    const breakout: Candle = {
      time: 11,
      open: 100,
      high: 102.2,
      low: 99.9,
      close: 102,
      volume: 1499,
    };

    expect(detectPattern(
      [...quietCandles, breakout],
      1,
      3,
      'range-breakout',
      100,
      settings,
    ).matched).toBe('none');
    expect(detectPattern(
      [...quietCandles, { ...breakout, volume: 1500 }],
      1,
      3,
      'range-breakout',
      100,
      settings,
    ).matched).toBe('bullish');
  });

  it('normalizes unsafe persisted pattern settings', () => {
    expect(normalizePatternSettings({
      rangeBreakout: {
        lookbackBars: 999,
        minBreakoutPercent: -4,
        volumeConfirmationMultiplier: 0.2,
      },
      volumeExpansion: {
        lookbackBars: 2,
        volumeMultiplier: 99,
        minCoveragePercent: 12,
      },
    })).toEqual({
      rangeBreakout: {
        lookbackBars: 100,
        minBreakoutPercent: 0,
        volumeConfirmationMultiplier: 1,
      },
      volumeExpansion: {
        lookbackBars: 5,
        volumeMultiplier: 5,
        minCoveragePercent: 60,
      },
    });
  });

  it('requires doubled recent volume for volume expansion', () => {
    const expansion: Candle = {
      time: 11,
      open: 100,
      high: 101.2,
      low: 99.9,
      close: 101,
      volume: 2200,
    };
    expect(detectPattern([...quietCandles, expansion], 0.5, 3, 'volume-expansion').matched).toBe('bullish');
  });

  it('applies a configurable volume-expansion lookback and multiplier', () => {
    const settings = {
      ...DEFAULT_PATTERN_SETTINGS,
      volumeExpansion: {
        ...DEFAULT_PATTERN_SETTINGS.volumeExpansion,
        lookbackBars: 5,
        volumeMultiplier: 1.5,
      },
    };
    const expansion: Candle = {
      time: 11,
      open: 100,
      high: 101.2,
      low: 99.9,
      close: 101,
      volume: 1600,
    };
    const strictSettings = {
      ...settings,
      volumeExpansion: {
        ...settings.volumeExpansion,
        volumeMultiplier: 2,
      },
    };

    expect(detectPattern(
      [...quietCandles.slice(-5), expansion],
      0.5,
      3,
      'volume-expansion',
      100,
      strictSettings,
    ).matched).toBe('none');
    expect(detectPattern(
      [...quietCandles.slice(-5), expansion],
      0.5,
      3,
      'volume-expansion',
      100,
      settings,
    ).matched).toBe('bullish');
  });

  it('uses the configured minimum positive-volume coverage', () => {
    const sparseVolume = quietCandles.map((candle, index) => ({
      ...candle,
      volume: index < 6 ? 1000 : 0,
    }));
    const settings = {
      ...DEFAULT_PATTERN_SETTINGS,
      volumeExpansion: {
        ...DEFAULT_PATTERN_SETTINGS.volumeExpansion,
        minCoveragePercent: 60,
      },
    };
    const expansion: Candle = {
      time: 11,
      open: 100,
      high: 101.2,
      low: 99.9,
      close: 101,
      volume: 2200,
    };

    expect(detectPattern(
      [...sparseVolume, expansion],
      0.5,
      3,
      'volume-expansion',
      100,
      settings,
    ).matched).toBe('bullish');
  });

  it('rejects volume expansion when the rolling volume baseline is missing', () => {
    const missingVolume = quietCandles.map((candle) => ({ ...candle, volume: 0 }));
    const expansion: Candle = {
      time: 11,
      open: 100,
      high: 101.2,
      low: 99.9,
      close: 101,
      volume: 2200,
    };

    expect(
      detectPattern([...missingVolume, expansion], 0.5, 3, 'volume-expansion').matched,
    ).toBe('none');
  });

  it('rejects sparse force-filled volume baselines', () => {
    const sparseVolume = quietCandles.map((candle, index) => ({
      ...candle,
      volume: index < 7 ? 1000 : 0,
    }));
    const expansion: Candle = {
      time: 11,
      open: 100,
      high: 101.2,
      low: 99.9,
      close: 101,
      volume: 5000,
    };

    expect(
      detectPattern([...sparseVolume, expansion], 0.5, 3, 'volume-expansion').matched,
    ).toBe('none');
  });

  it('detects a bullish engulfing reversal', () => {
    const candles: Candle[] = [
      { time: 1, open: 101, high: 101.2, low: 99.8, close: 100, volume: 1000 },
      { time: 2, open: 99.8, high: 101.7, low: 99.6, close: 101.5, volume: 1200 },
    ];
    const result = detectPattern(candles, 1, 3, 'engulfing-reversal');
    expect(result.matched).toBe('bullish');
    expect(result.message).toMatch(/engulfing reversal/i);
  });
});

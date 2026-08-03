'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  Info,
  Sliders,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import {
  DEFAULT_PATTERN_SETTINGS,
  getPatternDefinition,
  normalizePatternSettings,
  type PatternId,
  type PatternSettings,
} from '@/lib/scanner/patterns';
import { DETECTOR_RULE_GUIDANCE } from './pattern-settings/detectorGuidance';
import { EngulfingReversalControls } from './pattern-settings/EngulfingReversalControls';
import { MomentumBurstControls } from './pattern-settings/MomentumBurstControls';
import { RangeBreakoutControls } from './pattern-settings/RangeBreakoutControls';
import { VolumeExpansionControls } from './pattern-settings/VolumeExpansionControls';

interface InteractivePatternVisualizerProps {
  patternId: PatternId;
  minMovePercent?: number;
  requiredCount?: number;
  maxBodyOverlapPercent?: number;
  onMinMoveChange?: (val: number) => void;
  onRequiredCountChange?: (val: number) => void;
  onMaxBodyOverlapChange?: (val: number) => void;
  patternSettings?: PatternSettings;
  onPatternSettingsChange?: (settings: PatternSettings) => void;
}

export function InteractivePatternVisualizer({
  patternId,
  minMovePercent = 0.25,
  requiredCount = 3,
  maxBodyOverlapPercent = 100,
  onMinMoveChange,
  onRequiredCountChange,
  onMaxBodyOverlapChange,
  patternSettings = DEFAULT_PATTERN_SETTINGS,
  onPatternSettingsChange,
}: InteractivePatternVisualizerProps) {
  const [direction, setDirection] = useState<'bullish' | 'bearish'>('bullish');
  const [simScenario, setSimScenario] = useState<'valid' | 'fail-size' | 'fail-direction'>('valid');
  const [localMinMove, setLocalMinMove] = useState<number>(minMovePercent);
  const [localStreak, setLocalStreak] = useState<number>(requiredCount);
  const [localMaxOverlap, setLocalMaxOverlap] = useState<number>(
    maxBodyOverlapPercent,
  );
  const [showExplanation, setShowExplanation] = useState<boolean>(true);
  const resolvedPatternSettings = React.useMemo(
    () => normalizePatternSettings(patternSettings),
    [patternSettings],
  );

  // Sync external props if provided
  React.useEffect(() => {
    setLocalMinMove(minMovePercent);
  }, [minMovePercent]);

  React.useEffect(() => {
    setLocalStreak(requiredCount);
  }, [requiredCount]);

  React.useEffect(() => {
    setLocalMaxOverlap(maxBodyOverlapPercent);
  }, [maxBodyOverlapPercent]);

  const handleMinMoveUpdate = (val: number) => {
    setLocalMinMove(val);
    onMinMoveChange?.(val);
  };

  const handleStreakUpdate = (val: number) => {
    setLocalStreak(val);
    onRequiredCountChange?.(val);
  };

  const handleMaxOverlapUpdate = (val: number) => {
    setLocalMaxOverlap(val);
    onMaxBodyOverlapChange?.(val);
  };

  const isConsecutive = patternId === 'consecutive';
  const patternDefinition = getPatternDefinition(patternId);
  const ruleGuidance = DETECTOR_RULE_GUIDANCE[patternId];
  const streak = isConsecutive ? localStreak : 3;
  const targetThreshold = localMinMove;
  const isBullish = direction === 'bullish';

  React.useEffect(() => {
    setSimScenario('valid');
  }, [patternId]);

  // Keep every valid body above the selected threshold while varying the
  // bodies enough to resemble a real sequence instead of cloned bars.
  const validBodyMultipliers = [1.12, 1.48, 1.24, 1.62, 1.34];
  const simulatedCandles = Array.from({ length: streak }, (_, i) => {
    const isFailCandle =
      simScenario === 'fail-size' && i === Math.floor(streak / 2);
    const isDirectionFail =
      simScenario === 'fail-direction' && i === streak - 1;

    let bodyMove =
      targetThreshold * validBodyMultipliers[i % validBodyMultipliers.length];

    if (isFailCandle) {
      // Small squatty candle (below threshold)
      bodyMove = Math.max(0.01, targetThreshold * 0.4);
    }

    // Direction
    let candleIsBullish = isBullish;
    if (isDirectionFail) {
      candleIsBullish = !isBullish; // Pullback candle breaking streak
    }

    const passesSize = bodyMove >= targetThreshold;
    const passesDirection = !isConsecutive || candleIsBullish === isBullish;

    return {
      index: i + 1,
      bodyMove,
      passesSize,
      passesDirection,
      candleIsBullish,
    };
  });

  const allPass = simulatedCandles.every((c) => c.passesSize && c.passesDirection);
  const endingPrice = simulatedCandles.reduce(
    (price, candle) =>
      price *
      (1 + (candle.candleIsBullish ? candle.bodyMove : -candle.bodyMove) / 100),
    100,
  );
  const totalMove = endingPrice - 100;

  // Build one continuous price path. Each new candle opens near the prior
  // close, so a valid streak visibly climbs or falls instead of overlapping
  // around a shared baseline. Large thresholds are scaled down only as much
  // as needed to keep the complete sequence inside the chart.
  const referenceMove = targetThreshold *
    Array.from(
      { length: streak },
      (_, index) => validBodyMultipliers[index % validBodyMultipliers.length],
    ).reduce((sum, multiplier) => sum + multiplier, 0);
  const pixelsPerPercent = Math.min(45, 118 / Math.max(referenceMove, 0.01));
  const getPixelHeight = (percentMove: number) =>
    Math.max(3, percentMove * pixelsPerPercent);

  const thresholdPixelHeight = getPixelHeight(targetThreshold);
  let previousCloseY: number | null = null;
  let previousBodyHeight = 0;
  const candleGeometry = simulatedCandles.map((candle, index) => {
    const height = getPixelHeight(candle.bodyMove);
    const effectiveMaxOverlap = isConsecutive ? localMaxOverlap : 100;
    const overlapPixels = index === 0
      ? 0
      : Math.min(previousBodyHeight, height) * (effectiveMaxOverlap / 100);
    const openY = previousCloseY === null
      ? isBullish ? 190 : 50
      : previousCloseY + (isBullish ? overlapPixels : -overlapPixels);
    const closeY = candle.candleIsBullish
      ? openY - height
      : openY + height;
    const bodyY = Math.min(openY, closeY);

    previousCloseY = closeY;
    previousBodyHeight = height;

    return {
      ...candle,
      xCenter: 120 + index * 100,
      bodyPixelHeight: height,
      bodyY,
      closeY,
    };
  });

  return (
    <div className="rounded-xl border border-card-border bg-card-bg p-4 shadow-sm text-foreground space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border pb-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-accent">
            <Sparkles size={18} />
          </div>
          <div>
            <h4 className="text-base font-bold text-foreground flex items-center gap-2">
              Pattern settings & visual guide: <span className="text-accent">{patternDefinition.name}</span>
            </h4>
            <p className="text-xs text-muted">
              These settings apply globally to every symbol in the watchlist.
            </p>
          </div>
        </div>

        {/* Direction & Scenario Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">
            Preview direction
          </span>
          <div className="flex items-center rounded-lg border border-card-border bg-muted-bg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setDirection('bullish')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                direction === 'bullish'
                  ? 'bg-profit/15 text-profit'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              <TrendingUp size={14} />
              Bullish
            </button>
            <button
              type="button"
              onClick={() => setDirection('bearish')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                direction === 'bearish'
                  ? 'bg-loss/15 text-loss'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              <TrendingDown size={14} />
              Bearish
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowExplanation((prev) => !prev)}
            className="flex items-center gap-1.5 rounded-lg border border-card-border bg-muted-bg px-3 py-1.5 text-xs font-semibold text-muted hover:text-foreground transition-colors"
          >
            <HelpCircle size={14} />
            {showExplanation ? 'Hide Guide' : 'How it works'}
          </button>
        </div>
      </div>

      {/* Interactive Controls Row */}
      <div className="flex flex-wrap items-start gap-3 rounded-lg border border-card-border/60 bg-muted-bg/40 p-3">
        {/* Threshold Slider */}
        <div className="min-w-0 basis-[220px] grow space-y-1">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="min-move-slider" className="font-medium text-muted flex items-center gap-1">
              <Sliders size={12} className="text-accent" />
              {ruleGuidance.minBodyLabel}:
            </label>
            <span className="font-mono font-bold text-accent text-sm">{localMinMove.toFixed(2)}%</span>
          </div>
          <input
            id="min-move-slider"
            type="range"
            min="0.05"
            max="3.00"
            step="0.05"
            value={localMinMove}
            onChange={(e) => handleMinMoveUpdate(parseFloat(e.target.value))}
            className="w-full h-2 bg-card-border rounded-lg appearance-none cursor-pointer accent-accent"
          />
          <div className="flex justify-between text-[9px] text-muted font-mono">
            <span>0.05% (Small/Squatty)</span>
            <span>0.25% (Standard)</span>
            <span>3.00% (Very Large)</span>
          </div>
          <p className="text-[9px] leading-relaxed text-muted">
            {ruleGuidance.minBodyExplanation}
          </p>
        </div>

        {/* Streak Selector (for consecutive) */}
        {isConsecutive ? (
          <div className="min-w-0 basis-[220px] grow space-y-1">
            <span className="block text-xs font-medium text-muted">Required Streak Count:</span>
            <div className="flex items-center gap-1.5">
              {[3, 4, 5].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => handleStreakUpdate(cnt)}
                  className={`flex-1 py-1 rounded-md border text-xs font-bold transition-colors ${
                    localStreak === cnt
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-card-border bg-card-bg text-muted hover:text-foreground'
                  }`}
                >
                  {cnt} Candles
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {isConsecutive ? (
          <div className="min-w-0 basis-[220px] grow space-y-1">
            <span className="block text-xs font-medium text-muted">
              Body Staircase:
            </span>
            <div className="grid grid-cols-4 gap-1">
              {[
                { value: 100, label: 'Any' },
                { value: 25, label: '25%' },
                { value: 10, label: '10%' },
                { value: 0, label: 'Clean' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleMaxOverlapUpdate(option.value)}
                  className={`rounded-md border px-1 py-1 text-[10px] font-bold transition-colors ${
                    localMaxOverlap === option.value
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-card-border bg-card-bg text-muted hover:text-foreground'
                  }`}
                  title={
                    option.value === 100
                      ? 'Allow bodies to overlap without restriction'
                      : `Allow at most ${option.value}% overlap between neighboring candle bodies`
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-muted">
              {localMaxOverlap === 100
                ? 'Current behavior: body ranges may overlap.'
                : localMaxOverlap === 0
                  ? 'Strict: each body starts at or beyond the prior close.'
                  : `Neighboring bodies may overlap by at most ${localMaxOverlap}%.`}
            </p>
          </div>
        ) : null}

        {/* Scenario Test Switcher */}
        <div className="min-w-0 basis-[320px] grow space-y-1">
          <span className="block text-xs font-medium text-muted">Test Scenario:</span>
          <div className={`grid grid-cols-1 gap-1 ${isConsecutive ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            <button
              type="button"
              onClick={() => setSimScenario('valid')}
              className={`min-h-10 min-w-0 rounded border px-2 py-1.5 text-center text-[10px] font-semibold leading-tight transition-colors ${
                simScenario === 'valid'
                  ? 'border-profit bg-profit/15 text-profit'
                  : 'border-card-border bg-card-bg text-muted hover:text-foreground'
              }`}
            >
              {isConsecutive ? 'Valid Trigger' : 'Signal Body Passes'}
            </button>
            <button
              type="button"
              onClick={() => setSimScenario('fail-size')}
              className={`min-h-10 min-w-0 rounded border px-2 py-1.5 text-center text-[10px] font-semibold leading-tight transition-colors ${
                simScenario === 'fail-size'
                  ? 'border-loss bg-loss/15 text-loss'
                  : 'border-card-border bg-card-bg text-muted hover:text-foreground'
              }`}
            >
              Body Too Small
            </button>
            {isConsecutive ? (
              <button
                type="button"
                onClick={() => setSimScenario('fail-direction')}
                className={`min-h-10 min-w-0 rounded border px-2 py-1.5 text-center text-[10px] font-semibold leading-tight transition-colors ${
                  simScenario === 'fail-direction'
                    ? 'border-loss bg-loss/15 text-loss'
                    : 'border-card-border bg-card-bg text-muted hover:text-foreground'
                }`}
              >
                Broken Streak
              </button>
            ) : null}
          </div>
        </div>

        {patternId === 'range-breakout' ? (
          <RangeBreakoutControls
            value={resolvedPatternSettings.rangeBreakout}
            onChange={(rangeBreakout) => onPatternSettingsChange?.({
              ...resolvedPatternSettings,
              rangeBreakout,
            })}
          />
        ) : null}

        {patternId === 'momentum-burst' ? (
          <MomentumBurstControls
            value={resolvedPatternSettings.momentumBurst}
            onChange={(momentumBurst) => onPatternSettingsChange?.({
              ...resolvedPatternSettings,
              momentumBurst,
            })}
          />
        ) : null}

        {patternId === 'volume-expansion' ? (
          <VolumeExpansionControls
            value={resolvedPatternSettings.volumeExpansion}
            onChange={(volumeExpansion) => onPatternSettingsChange?.({
              ...resolvedPatternSettings,
              volumeExpansion,
            })}
          />
        ) : null}

        {patternId === 'engulfing-reversal' ? (
          <EngulfingReversalControls
            value={resolvedPatternSettings.engulfingReversal}
            onChange={(engulfingReversal) => onPatternSettingsChange?.({
              ...resolvedPatternSettings,
              engulfingReversal,
            })}
          />
        ) : null}

        <div className="basis-full rounded-xl border border-card-border bg-card-bg/70 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-foreground">
            <Info size={14} className="shrink-0 text-accent" />
            Current detector rules
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {ruleGuidance.currentRules.map((rule) => (
              <div key={rule.label} className="rounded-lg border border-card-border/60 bg-muted-bg/40 p-2 text-xs">
                <span className="block font-bold text-foreground">{rule.label}</span>
                <span className="text-muted">{rule.value}</span>
              </div>
            ))}
          </div>
          {!isConsecutive ? (
            <p className="mt-2 text-xs leading-relaxed text-muted">
              The preview below demonstrates the adjustable signal-body threshold only.
              A real match must also pass every fixed rule listed above.
            </p>
          ) : null}
          <div className="mt-2 border-t border-card-border/60 pt-2 text-xs">
            <span className="font-bold text-foreground">
              Recommended next controls (not active yet):
            </span>
            <span className="ml-1 text-muted">
              {ruleGuidance.recommendedControls.join(' · ')}
            </span>
          </div>
        </div>
      </div>

      {/* Dynamic Candlestick Diagram SVG */}
      <div className="rounded-lg border border-card-border/80 bg-background/80 p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-[220px] flex-1 text-[11px] font-medium leading-relaxed text-muted">
            {isConsecutive
              ? `Trigger Preview (${simulatedCandles.length} Bars) — ${localMaxOverlap === 0 ? 'clean staircase' : `≤${localMaxOverlap}% body overlap`}, closes progress ${isBullish ? 'higher' : 'lower'}`
              : `${patternDefinition.name} base-candle preview — ${patternDefinition.shortDescription}`}
          </div>

          {allPass ? (
            <span className="inline-flex max-w-full shrink-0 items-center justify-center gap-1 rounded-full border border-profit/30 bg-profit/10 px-3 py-1 text-center text-xs font-bold text-profit">
              <CheckCircle2 size={13} />
              {isConsecutive ? 'PATTERN DETECTED' : 'BASE CANDLE VALID'} ({totalMove >= 0 ? '+' : ''}{totalMove.toFixed(2)}%)
            </span>
          ) : (
            <span className="inline-flex max-w-full shrink-0 items-center justify-center gap-1 rounded-full border border-loss/30 bg-loss/10 px-3 py-1 text-center text-xs font-bold text-loss">
              <XCircle size={13} />
              {isConsecutive ? 'IGNORED' : 'BASE CANDLE INVALID'} (Threshold Not Met)
            </span>
          )}
        </div>

        {/* SVG Visualization */}
        <div className="w-full overflow-x-auto py-2">
          <svg
            viewBox={`0 0 ${simulatedCandles.length * 110 + 100} 240`}
            className="w-full max-w-full h-52 select-none"
            role="img"
            aria-label="Dynamic candlestick pattern diagram"
          >
            {/* Background Grid Lines */}
            <line x1="0" y1="30" x2="1000" y2="30" stroke="currentColor" className="text-card-border" strokeDasharray="3 3" opacity="0.5" />
            <line x1="0" y1="110" x2="1000" y2="110" stroke="currentColor" className="text-card-border" strokeDasharray="3 3" opacity="0.5" />
            <line x1="0" y1="190" x2="1000" y2="190" stroke="currentColor" className="text-card-border" strokeDasharray="3 3" opacity="0.5" />

            {/* A separate ruler communicates body size without pretending the
                threshold is a horizontal price level shared by every candle. */}
            <g>
              <line
                x1="28"
                y1={205 - thresholdPixelHeight}
                x2="28"
                y2="205"
                stroke="currentColor"
                className="text-accent"
                strokeWidth="1.5"
                opacity="0.8"
              />
              <line x1="22" y1={205 - thresholdPixelHeight} x2="34" y2={205 - thresholdPixelHeight} stroke="currentColor" className="text-accent" strokeWidth="1.5" />
              <line x1="22" y1="205" x2="34" y2="205" stroke="currentColor" className="text-accent" strokeWidth="1.5" />
              <text
                x="12"
                y="222"
                className="text-[9px] fill-accent font-mono font-bold"
              >
                MIN {targetThreshold.toFixed(2)}%
              </text>
            </g>

            {/* Connecting the closes makes the monotonic requirement visible. */}
            <polyline
              points={candleGeometry.map((candle) => `${candle.xCenter},${candle.closeY}`).join(' ')}
              fill="none"
              stroke="currentColor"
              className={isBullish ? 'text-profit' : 'text-loss'}
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity="0.45"
            />

            {/* Render Simulated Candles */}
            {candleGeometry.map((c) => {
              const { xCenter, bodyPixelHeight, bodyY } = c;
              const candleBullish = c.candleIsBullish;
              const colorClass = candleBullish ? '#10b981' : '#ef4444'; // profit vs loss
              const wickHeight = 12;
              const highY = bodyY - wickHeight;
              const lowY = bodyY + bodyPixelHeight + wickHeight;

              return (
                <g key={c.index} className="transition-all duration-300">
                  {/* Wick */}
                  <line
                    x1={xCenter}
                    y1={highY}
                    x2={xCenter}
                    y2={lowY}
                    stroke={colorClass}
                    strokeWidth="2"
                  />

                  {/* Body Rect */}
                  <rect
                    x={xCenter - 16}
                    y={bodyY}
                    width="32"
                    height={bodyPixelHeight}
                    rx="3"
                    fill={colorClass}
                    fillOpacity={c.passesSize && c.passesDirection ? '0.9' : '0.4'}
                    stroke={colorClass}
                    strokeWidth="1.5"
                  />

                  {/* Label Bar Move % */}
                  <text
                    x={xCenter}
                    y={highY - 6}
                    textAnchor="middle"
                    className={`text-[11px] font-mono font-bold ${
                      c.passesSize && c.passesDirection ? 'fill-foreground' : 'fill-loss'
                    }`}
                  >
                    {c.candleIsBullish ? '+' : '-'}{c.bodyMove.toFixed(2)}%
                  </text>

                  {/* Candle Index Tag */}
                  <text
                    x={xCenter}
                    y="228"
                    textAnchor="middle"
                    className="text-[9px] font-mono fill-muted"
                  >
                    Bar #{c.index} · {c.bodyMove.toFixed(2)}%
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Step-by-Step Rule Checklist & Explanation */}
      {showExplanation ? (
        <div className="rounded-lg bg-muted-bg/50 p-3 text-xs border border-card-border/50 space-y-2">
          <div className="font-semibold text-foreground flex items-center gap-1.5">
            <Info size={14} className="text-accent" />
            Step-by-Step Detector Evaluation Rules:
          </div>

          {isConsecutive ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div className={`p-2 rounded-md border ${
              simScenario !== 'fail-direction'
                ? 'border-profit/30 bg-profit/5 text-profit'
                : 'border-loss/30 bg-loss/5 text-loss'
            }`}>
              <div className="font-bold flex items-center gap-1">
                {simScenario !== 'fail-direction' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                1. Consecutive Streak
              </div>
              <p className="mt-0.5 text-[10px] text-muted">
                Requires {localStreak} uninterrupted {direction} candles in a row.
              </p>
            </div>

            <div className={`p-2 rounded-md border ${
              simScenario !== 'fail-size'
                ? 'border-profit/30 bg-profit/5 text-profit'
                : 'border-loss/30 bg-loss/5 text-loss'
            }`}>
              <div className="font-bold flex items-center gap-1">
                {simScenario !== 'fail-size' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                2. Body Size Threshold
              </div>
              <p className="mt-0.5 text-[10px] text-muted">
                Every single candle body must be ≥ {localMinMove.toFixed(2)}%. Small/squatty candles will be filtered out.
              </p>
            </div>

            <div className="p-2 rounded-md border border-profit/30 bg-profit/5 text-profit">
              <div className="font-bold flex items-center gap-1">
                <CheckCircle2 size={13} />
                3. Monotonic Closes
              </div>
              <p className="mt-0.5 text-[10px] text-muted">
                Closes must progress continuously ({isBullish ? 'higher closes' : 'lower closes'}).
              </p>
            </div>

            <div className="p-2 rounded-md border border-profit/30 bg-profit/5 text-profit">
              <div className="font-bold flex items-center gap-1">
                <CheckCircle2 size={13} />
                4. Body Staircase
              </div>
              <p className="mt-0.5 text-[10px] text-muted">
                {localMaxOverlap === 100
                  ? 'No overlap restriction is applied.'
                  : `Adjacent bodies may overlap by no more than ${localMaxOverlap}%.`}
              </p>
            </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className={`rounded-md border p-2 ${
                simScenario !== 'fail-size'
                  ? 'border-profit/30 bg-profit/5 text-profit'
                  : 'border-loss/30 bg-loss/5 text-loss'
              }`}>
                <div className="flex items-center gap-1 font-bold">
                  {simScenario !== 'fail-size' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  1. Body Size Threshold
                </div>
                <p className="mt-0.5 text-[10px] text-muted">
                  The directional candle body must be at least {localMinMove.toFixed(2)}%.
                </p>
              </div>

              <div className="rounded-md border border-profit/30 bg-profit/5 p-2 text-profit">
                <div className="flex items-center gap-1 font-bold">
                  <CheckCircle2 size={13} />
                  2. {patternDefinition.name} Condition
                </div>
                <p className="mt-0.5 text-[10px] text-muted">
                  {patternDefinition.shortDescription}
                </p>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

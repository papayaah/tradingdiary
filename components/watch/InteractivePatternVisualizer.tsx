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
  getPatternDefinition,
  normalizePatternSettings,
  type PatternId,
  type PatternSettings,
} from '@/lib/scanner/patterns';
import { DETECTOR_RULE_GUIDANCE } from './pattern-settings/detectorGuidance';
import { MomentumBurstControls } from './pattern-settings/MomentumBurstControls';
import { RangeBreakoutControls } from './pattern-settings/RangeBreakoutControls';
import { VolumeExpansionControls } from './pattern-settings/VolumeExpansionControls';
import { EngulfingReversalControls } from './pattern-settings/EngulfingReversalControls';

interface InteractivePatternVisualizerProps {
  patternId: PatternId;
  minMovePercent?: number;
  requiredCount?: number;
  maxBodyOverlapPercent?: number;
  patternSettings?: PatternSettings;
  onMinMoveChange?: (val: number) => void;
  onRequiredCountChange?: (val: number) => void;
  onMaxBodyOverlapChange?: (val: number) => void;
  onPatternSettingsChange?: (settings: PatternSettings) => void;
}

function buildMomentumBurstPreview(
  minMovePercent: number,
  bodyMultiplier: number,
  validScenario: boolean,
) {
  const averageBody = 0.13;
  const relativeThreshold = averageBody * bodyMultiplier;
  const requiredSignalBody = Math.max(minMovePercent, relativeThreshold);
  const signalBody = validScenario
    ? requiredSignalBody * 1.15
    : requiredSignalBody * 0.4;

  return {
    averageBody,
    relativeThreshold,
    requiredSignalBody,
    signalBody,
    baselineBodies: [0.11, 0.15, 0.12],
    passesAbsoluteMinimum: signalBody >= minMovePercent,
    passesRelativeExpansion: signalBody >= relativeThreshold,
  };
}

export function InteractivePatternVisualizer({
  patternId,
  minMovePercent = 0.25,
  requiredCount = 3,
  maxBodyOverlapPercent = 100,
  patternSettings,
  onMinMoveChange,
  onRequiredCountChange,
  onMaxBodyOverlapChange,
  onPatternSettingsChange,
}: InteractivePatternVisualizerProps) {
  const [direction, setDirection] = useState<'bullish' | 'bearish'>('bullish');
  // Preview always shows a valid trigger; the fail-scenario switcher was removed.
  const [simScenario] = useState<'valid' | 'fail-size' | 'fail-direction'>('valid');
  const [localMinMove, setLocalMinMove] = useState<number>(minMovePercent);
  const [localStreak, setLocalStreak] = useState<number>(requiredCount);
  const [localMaxOverlap, setLocalMaxOverlap] = useState<number>(maxBodyOverlapPercent);
  const [localPatternSettings, setLocalPatternSettings] = useState<PatternSettings | undefined>(patternSettings);
  const [showExplanation, setShowExplanation] = useState<boolean>(false);

  const parentSyncTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const debounceParentSync = React.useCallback((callback: () => void) => {
    if (parentSyncTimerRef.current) {
      clearTimeout(parentSyncTimerRef.current);
    }
    parentSyncTimerRef.current = setTimeout(callback, 150);
  }, []);

  const resolvedPatternSettings = React.useMemo(
    () => normalizePatternSettings(localPatternSettings ?? patternSettings),
    [localPatternSettings, patternSettings],
  );

  React.useEffect(() => {
    setLocalMinMove(minMovePercent);
  }, [minMovePercent]);

  React.useEffect(() => {
    setLocalStreak(requiredCount);
  }, [requiredCount]);

  React.useEffect(() => {
    setLocalMaxOverlap(maxBodyOverlapPercent);
  }, [maxBodyOverlapPercent]);

  React.useEffect(() => {
    setLocalPatternSettings(patternSettings);
  }, [patternSettings]);

  const handleMinMoveUpdate = (val: number) => {
    setLocalMinMove(val);
    debounceParentSync(() => onMinMoveChange?.(val));
  };

  const handleStreakUpdate = (val: number) => {
    setLocalStreak(val);
    debounceParentSync(() => onRequiredCountChange?.(val));
  };

  const handleMaxOverlapUpdate = (val: number) => {
    setLocalMaxOverlap(val);
    debounceParentSync(() => onMaxBodyOverlapChange?.(val));
  };

  const handlePatternSettingsUpdate = (nextSettings: PatternSettings) => {
    setLocalPatternSettings(nextSettings);
    debounceParentSync(() => onPatternSettingsChange?.(nextSettings));
  };

  const isConsecutive = patternId === 'consecutive';
  const isMomentumBurst = patternId === 'momentum-burst';
  const isEngulfingReversal = patternId === 'engulfing-reversal';
  const isRangeBreakout = patternId === 'range-breakout';
  const isVolumeExpansion = patternId === 'volume-expansion';

  const patternDefinition = getPatternDefinition(patternId);
  const ruleGuidance = DETECTOR_RULE_GUIDANCE[patternId];
  const streak = isConsecutive ? localStreak : isMomentumBurst ? 4 : isEngulfingReversal ? 2 : 3;
  const targetThreshold = localMinMove;
  const isBullish = direction === 'bullish';

  const momentumPreview = buildMomentumBurstPreview(
    targetThreshold,
    resolvedPatternSettings.momentumBurst.bodyMultiplier,
    simScenario !== 'fail-size',
  );

  const getSimulatedCandles = () => {
    if (isEngulfingReversal) {
      const { minPriorBodyPercent, minBodyRatio } = resolvedPatternSettings.engulfingReversal;
      
      const baselinePrior = minPriorBodyPercent > 0 ? minPriorBodyPercent : 0.25;
      const isFailPrior = simScenario === 'fail-size' && minPriorBodyPercent > 0;
      
      const priorBodyMove = isFailPrior
        ? Math.max(0.02, minPriorBodyPercent * 0.5)
        : baselinePrior * 1.25;
      
      let signalBodyMove = Math.max(targetThreshold, priorBodyMove * minBodyRatio * 1.25);
      let passesSignalSize = true;

      if (simScenario === 'fail-size') {
        // Fail either signal body size or prior body size
        if (minPriorBodyPercent > 0) {
          // If prior min body is active, priorBodyMove is already set to fail
          passesSignalSize = true;
        } else {
          signalBodyMove = Math.max(0.02, targetThreshold * 0.4);
          passesSignalSize = false;
        }
      }

      const passesPriorSize = minPriorBodyPercent > 0 ? priorBodyMove >= minPriorBodyPercent : true;

      return [
        {
          index: 1,
          bodyMove: priorBodyMove,
          passesSize: passesPriorSize,
          passesDirection: true,
          candleIsBullish: !isBullish, // Opposite direction prior candle!
          label: 'Prior Candle',
        },
        {
          index: 2,
          bodyMove: signalBodyMove,
          passesSize: passesSignalSize && (signalBodyMove >= priorBodyMove * minBodyRatio),
          passesDirection: true,
          candleIsBullish: isBullish, // Signal direction candle!
          label: 'Engulfing Signal',
          ratio: signalBodyMove / priorBodyMove,
        },
      ];
    }

    if (isRangeBreakout) {
      const { minBreakoutPercent } = resolvedPatternSettings.rangeBreakout;
      const rangeChannelMove = 0.15;
      
      let breakoutBodyMove = rangeChannelMove + Math.max(targetThreshold, minBreakoutPercent) * 1.25;
      let passesSize = true;

      if (simScenario === 'fail-size') {
        breakoutBodyMove = rangeChannelMove + Math.min(targetThreshold, minBreakoutPercent) * 0.4;
        passesSize = false;
      }

      return [
        { index: 1, bodyMove: 0.12, passesSize: true, passesDirection: true, candleIsBullish: false, label: 'Range High/Low' },
        { index: 2, bodyMove: 0.14, passesSize: true, passesDirection: true, candleIsBullish: true, label: 'Consolidation' },
        { index: 3, bodyMove: breakoutBodyMove, passesSize, passesDirection: true, candleIsBullish: isBullish, label: 'Breakout Signal' },
      ];
    }

    if (isVolumeExpansion) {
      const { volumeMultiplier } = resolvedPatternSettings.volumeExpansion;
      let signalBodyMove = Math.max(targetThreshold, 0.35);
      let passesSize = true;
      let volumeVal = volumeMultiplier * 1.35;

      if (simScenario === 'fail-size') {
        signalBodyMove = Math.max(0.02, targetThreshold * 0.4);
        volumeVal = volumeMultiplier * 0.55;
        passesSize = false;
      }

      return [
        { index: 1, bodyMove: 0.12, volume: 1.0, passesSize: true, passesDirection: true, candleIsBullish: isBullish, label: 'Prior Bar' },
        { index: 2, bodyMove: 0.14, volume: 1.1, passesSize: true, passesDirection: true, candleIsBullish: isBullish, label: 'Prior Bar' },
        { index: 3, bodyMove: signalBodyMove, volume: volumeVal, passesSize: passesSize && (volumeVal >= volumeMultiplier), passesDirection: true, candleIsBullish: isBullish, label: 'Volume Signal' },
      ];
    }

    if (isMomentumBurst) {
      return [
        ...momentumPreview.baselineBodies.map((bodyMove, index) => ({
          index: index + 1,
          bodyMove,
          passesSize: true,
          passesDirection: true,
          candleIsBullish: isBullish,
          label: `Prior ${index + 1}`,
        })),
        {
          index: momentumPreview.baselineBodies.length + 1,
          bodyMove: momentumPreview.signalBody,
          passesSize:
            momentumPreview.passesAbsoluteMinimum
            && momentumPreview.passesRelativeExpansion,
          passesDirection: true,
          candleIsBullish: isBullish,
          label: 'Signal Burst',
        },
      ];
    }

    // Default: Consecutive Move
    const validBodyMultipliers = [1.12, 1.48, 1.24, 1.62, 1.34];
    return Array.from({ length: streak }, (_, i) => {
      const isFailCandle = simScenario === 'fail-size' && i === Math.floor(streak / 2);
      const isDirectionFail = simScenario === 'fail-direction' && i === streak - 1;

      let bodyMove = targetThreshold * validBodyMultipliers[i % validBodyMultipliers.length];
      if (isFailCandle) {
        bodyMove = Math.max(0.01, targetThreshold * 0.4);
      }

      let candleIsBullish = isBullish;
      if (isDirectionFail) {
        candleIsBullish = !isBullish;
      }

      const passesSize = bodyMove >= targetThreshold;
      const passesDirection = candleIsBullish === isBullish;

      return {
        index: i + 1,
        bodyMove,
        passesSize,
        passesDirection,
        candleIsBullish,
        label: `Bar #${i + 1}`,
      };
    });
  };

  const simulatedCandles = getSimulatedCandles();
  const allPass = simulatedCandles.every((c) => c.passesSize && c.passesDirection);

  // Pixel scaling
  const referenceMove = simulatedCandles.reduce((sum, candle) => sum + candle.bodyMove, 0);
  const pixelsPerPercent = Math.min(50, 110 / Math.max(referenceMove, 0.01));
  const getPixelHeight = (percentMove: number) => Math.max(6, percentMove * pixelsPerPercent);

  const visualThreshold = isMomentumBurst ? momentumPreview.requiredSignalBody : targetThreshold;
  const thresholdPixelHeight = getPixelHeight(visualThreshold);

  // Compute Geometry for SVG Drawing
  const computeGeometry = () => {
    if (isEngulfingReversal) {
      const prior = simulatedCandles[0];
      const signal = simulatedCandles[1];

      const priorH = getPixelHeight(prior.bodyMove);
      // Signal height reflects its real body %, but is never smaller than what it
      // takes to fully engulf the prior body (so it always reads as an engulf).
      const signalPix = Math.max(priorH + 16, getPixelHeight(signal.bodyMove));

      if (isBullish) {
        // Bullish engulf: red prior opens high and closes low (grows down).
        // The green signal opens just below the prior's low and CLOSES upward,
        // so a stronger bullish signal visibly grows UP — the direction a
        // bullish candle should move.
        const priorOpenY = 95;
        const priorCloseY = priorOpenY + priorH;
        const signalOpenY = priorCloseY + 8;          // green open (bottom)
        const signalCloseY = signalOpenY - signalPix; // green close (top) rises up

        return [
          { ...prior, xCenter: 160, bodyPixelHeight: priorH, bodyY: priorOpenY, openY: priorOpenY, closeY: priorCloseY },
          { ...signal, xCenter: 270, bodyPixelHeight: signalPix, bodyY: signalCloseY, openY: signalOpenY, closeY: signalCloseY },
        ];
      } else {
        // Bearish engulf: green prior opens low and closes high. The red signal
        // opens just above the prior's high and CLOSES downward, so a stronger
        // bearish signal grows DOWN.
        const priorCloseY = 95;
        const priorOpenY = priorCloseY + priorH;
        const signalOpenY = priorCloseY - 8;          // red open (top)
        const signalCloseY = signalOpenY + signalPix; // red close (bottom) drops down

        return [
          { ...prior, xCenter: 160, bodyPixelHeight: priorH, bodyY: priorCloseY, openY: priorOpenY, closeY: priorCloseY },
          { ...signal, xCenter: 270, bodyPixelHeight: signalPix, bodyY: signalOpenY, openY: signalOpenY, closeY: signalCloseY },
        ];
      }
    }

    if (isRangeBreakout) {
      const rangeHighY = 90;
      const rangeLowY = 135;
      return simulatedCandles.map((candle, index) => {
        const height = getPixelHeight(candle.bodyMove);
        let bodyY = 105;
        if (index === 2) {
          bodyY = isBullish ? rangeHighY - height + 6 : rangeLowY - 6;
        }
        return {
          ...candle,
          xCenter: 130 + index * 100,
          bodyPixelHeight: height,
          bodyY,
          openY: isBullish ? bodyY + height : bodyY,
          closeY: isBullish ? bodyY : bodyY + height,
        };
      });
    }

    // Default Staircase / Continuous Geometry
    let previousCloseY: number | null = null;
    let previousBodyHeight = 0;
    const startY = isBullish ? 160 : 70;

    return simulatedCandles.map((candle, index) => {
      const height = getPixelHeight(candle.bodyMove);
      const effectiveMaxOverlap = isConsecutive ? localMaxOverlap : 100;
      const overlapPixels = index === 0 ? 0 : Math.min(previousBodyHeight, height) * (effectiveMaxOverlap / 100);

      const openY = previousCloseY === null
        ? startY
        : previousCloseY + (isBullish ? overlapPixels : -overlapPixels);
      const closeY = candle.candleIsBullish ? openY - height : openY + height;
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
  };

  const candleGeometry = computeGeometry();

  return (
    <div className="rounded-xl border border-card-border bg-card-bg p-4 shadow-sm text-foreground space-y-4">
      {/* Header */}
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
              These settings apply to this pattern across every symbol in the watchlist.
            </p>
          </div>
        </div>

        {/* Direction & Rule Guide Toggles */}
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
            {showExplanation ? 'Hide detector rules' : 'How this signal works'}
          </button>
        </div>
      </div>

      {/* Row 1: Primary Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full rounded-xl border border-card-border/60 bg-muted-bg/40 p-4">
        {/* Main Threshold Slider */}
        {!isMomentumBurst ? (
          <div className="w-full space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="min-move-slider" className="font-semibold text-foreground flex items-center gap-1">
                <Sliders size={13} className="text-accent" />
                {ruleGuidance.minBodyLabel}
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
            <div className="flex justify-between text-[10px] text-muted font-mono">
              <span>0.05% (Small)</span>
              <span>0.25% (Standard)</span>
              <span>3.00% (Large)</span>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              {ruleGuidance.minBodyExplanation}
            </p>
          </div>
        ) : null}

        {/* Streak Selector (for consecutive) */}
        {isConsecutive ? (
          <div className="w-full space-y-1.5">
            <span className="block text-xs font-semibold text-foreground">Required Streak Count</span>
            <div className="flex items-center gap-1.5">
              {[3, 4, 5].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => handleStreakUpdate(cnt)}
                  className={`flex-1 py-1.5 rounded-md border text-xs font-bold transition-colors ${
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

        {/* Staircase Overlap (for consecutive) */}
        {isConsecutive ? (
          <div className="w-full space-y-1.5">
            <span className="block text-xs font-semibold text-foreground">Body Staircase</span>
            <div className="grid grid-cols-4 gap-1.5">
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
                  className={`rounded-md border py-1.5 text-xs font-bold transition-colors ${
                    localMaxOverlap === option.value
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-card-border bg-card-bg text-muted hover:text-foreground'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

      </div>

      {/* Row 2: Full-width Pattern Specific Controls */}
      {isMomentumBurst ? (
        <MomentumBurstControls
          value={resolvedPatternSettings.momentumBurst}
          minMovePercent={localMinMove}
          onMinMoveChange={handleMinMoveUpdate}
          onChange={(momentumBurst) => handlePatternSettingsUpdate({
            ...resolvedPatternSettings,
            momentumBurst,
          })}
        />
      ) : null}

      {isEngulfingReversal ? (
        <EngulfingReversalControls
          value={resolvedPatternSettings.engulfingReversal}
          onChange={(engulfingReversal) => handlePatternSettingsUpdate({
            ...resolvedPatternSettings,
            engulfingReversal,
          })}
        />
      ) : null}

      {isRangeBreakout ? (
        <RangeBreakoutControls
          value={resolvedPatternSettings.rangeBreakout}
          onChange={(rangeBreakout) => handlePatternSettingsUpdate({
            ...resolvedPatternSettings,
            rangeBreakout,
          })}
        />
      ) : null}

      {isVolumeExpansion ? (
        <VolumeExpansionControls
          value={resolvedPatternSettings.volumeExpansion}
          onChange={(volumeExpansion) => handlePatternSettingsUpdate({
            ...resolvedPatternSettings,
            volumeExpansion,
          })}
        />
      ) : null}

      {/* Explanation Box */}
      {showExplanation ? (
        <div id="detector-rule-guide" className="rounded-xl border border-card-border bg-card-bg/70 p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <Info size={14} className="shrink-0 text-accent" />
            Current detector rules & requirements
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {ruleGuidance.currentRules.map((rule) => (
              <div key={rule.label} className="rounded-lg border border-card-border/60 bg-muted-bg/40 p-2.5 text-xs">
                <span className="block font-bold text-foreground">{rule.label}</span>
                <span className="text-muted">{rule.value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Dynamic Candlestick Diagram SVG */}
      <div className="rounded-xl border border-card-border/80 bg-background/90 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-muted">
            {isEngulfingReversal
              ? `Engulfing Reversal Preview — Opposite prior candle body is fully engulfed by the ${isBullish ? 'bullish' : 'bearish'} signal body`
              : isRangeBreakout
                ? `Range Breakout Preview — Signal candle closes cleanly beyond the consolidation range channel`
                : isVolumeExpansion
                  ? `Volume Expansion Preview — Directional signal move confirmed with elevated relative volume`
                  : isMomentumBurst
                    ? `Momentum Burst Preview — Signal candle body expands sharply vs prior baseline average`
                    : `Consecutive Move Preview (${simulatedCandles.length} Bars)`}
          </div>

          {allPass ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-profit/30 bg-profit/10 px-3 py-1 text-xs font-bold text-profit">
              <CheckCircle2 size={14} />
              {patternDefinition.name.toUpperCase()} VALID
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-loss/30 bg-loss/10 px-3 py-1 text-xs font-bold text-loss">
              <XCircle size={14} />
              PATTERN INVALID (Threshold Not Met)
            </span>
          )}
        </div>

        {/* SVG Canvas */}
        <div className="w-full overflow-x-auto py-2">
          <svg
            viewBox={`0 0 ${simulatedCandles.length * 120 + 140} 240`}
            className="w-full max-w-full h-56 select-none"
            role="img"
            aria-label="Dynamic candlestick pattern diagram"
          >
            {/* Background Grid Lines */}
            <line x1="0" y1="40" x2="1000" y2="40" stroke="currentColor" className="text-card-border" strokeDasharray="3 3" opacity="0.4" />
            <line x1="0" y1="120" x2="1000" y2="120" stroke="currentColor" className="text-card-border" strokeDasharray="3 3" opacity="0.4" />
            <line x1="0" y1="190" x2="1000" y2="190" stroke="currentColor" className="text-card-border" strokeDasharray="3 3" opacity="0.4" />

            {/* Range Channel Lines (for Range Breakout) */}
            {isRangeBreakout ? (
              <g>
                <line x1="60" y1="90" x2="400" y2="90" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.8" />
                <text x="65" y="84" fill="#3b82f6" className="text-[9px] font-mono font-bold">Range High Boundary</text>
                
                <line x1="60" y1="135" x2="400" y2="135" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.8" />
                <text x="65" y="147" fill="#3b82f6" className="text-[9px] font-mono font-bold">Range Low Boundary</text>
              </g>
            ) : null}

            {/* Momentum Burst Expansion Threshold Line */}
            {isMomentumBurst ? (
              <g>
                <line
                  x1="60"
                  y1={190 - getPixelHeight(momentumPreview.relativeThreshold)}
                  x2="500"
                  y2={190 - getPixelHeight(momentumPreview.relativeThreshold)}
                  stroke="#ec4899"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  opacity="0.8"
                />
                <rect
                  x="280"
                  y={190 - getPixelHeight(momentumPreview.relativeThreshold) - 15}
                  width="190"
                  height="14"
                  rx="3"
                  fill="#ec4899"
                  fillOpacity="0.15"
                />
                <text
                  x="285"
                  y={190 - getPixelHeight(momentumPreview.relativeThreshold) - 4}
                  fill="#ec4899"
                  className="text-[9px] font-mono font-bold"
                >
                  Expansion Target: {resolvedPatternSettings.momentumBurst.bodyMultiplier.toFixed(1)}× ({momentumPreview.relativeThreshold.toFixed(2)}%)
                </text>
              </g>
            ) : null}

            {/* Engulfing Reversal Min Prior Body Line */}
            {isEngulfingReversal && resolvedPatternSettings.engulfingReversal.minPriorBodyPercent > 0 ? (
              <g>
                <line
                  x1="60"
                  y1={190 - getPixelHeight(resolvedPatternSettings.engulfingReversal.minPriorBodyPercent)}
                  x2="210"
                  y2={190 - getPixelHeight(resolvedPatternSettings.engulfingReversal.minPriorBodyPercent)}
                  stroke="#3b82f6"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  opacity="0.8"
                />
                <rect
                  x="60"
                  y={190 - getPixelHeight(resolvedPatternSettings.engulfingReversal.minPriorBodyPercent) - 15}
                  width="110"
                  height="14"
                  rx="3"
                  fill="#3b82f6"
                  fillOpacity="0.15"
                />
                <text
                  x="65"
                  y={190 - getPixelHeight(resolvedPatternSettings.engulfingReversal.minPriorBodyPercent) - 4}
                  fill="#3b82f6"
                  className="text-[9px] font-mono font-bold"
                >
                  Min Prior: {resolvedPatternSettings.engulfingReversal.minPriorBodyPercent.toFixed(2)}%
                </text>
              </g>
            ) : null}

            {/* Range Breakout Target Line */}
            {isRangeBreakout && resolvedPatternSettings.rangeBreakout.minBreakoutPercent > 0 ? (
              <g>
                <line
                  x1="220"
                  y1={isBullish 
                    ? 90 - getPixelHeight(resolvedPatternSettings.rangeBreakout.minBreakoutPercent)
                    : 135 + getPixelHeight(resolvedPatternSettings.rangeBreakout.minBreakoutPercent)
                  }
                  x2="400"
                  y2={isBullish 
                    ? 90 - getPixelHeight(resolvedPatternSettings.rangeBreakout.minBreakoutPercent)
                    : 135 + getPixelHeight(resolvedPatternSettings.rangeBreakout.minBreakoutPercent)
                  }
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  opacity="0.8"
                />
                <rect
                  x="260"
                  y={isBullish
                    ? 90 - getPixelHeight(resolvedPatternSettings.rangeBreakout.minBreakoutPercent) - 15
                    : 135 + getPixelHeight(resolvedPatternSettings.rangeBreakout.minBreakoutPercent) + 2
                  }
                  width="135"
                  height="14"
                  rx="3"
                  fill="#ef4444"
                  fillOpacity="0.15"
                />
                <text
                  x="265"
                  y={isBullish
                    ? 90 - getPixelHeight(resolvedPatternSettings.rangeBreakout.minBreakoutPercent) - 4
                    : 135 + getPixelHeight(resolvedPatternSettings.rangeBreakout.minBreakoutPercent) + 12
                  }
                  fill="#ef4444"
                  className="text-[9px] font-mono font-bold"
                >
                  Target Close: +{resolvedPatternSettings.rangeBreakout.minBreakoutPercent.toFixed(2)}%
                </text>
              </g>
            ) : null}

            {/* Volume Expansion Required Vol Line */}
            {isVolumeExpansion ? (
              <g>
                <line
                  x1="260"
                  y1={215 - resolvedPatternSettings.volumeExpansion.volumeMultiplier * 12}
                  x2="380"
                  y2={215 - resolvedPatternSettings.volumeExpansion.volumeMultiplier * 12}
                  stroke="#eab308"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  opacity="0.8"
                />
                <rect
                  x="260"
                  y={215 - resolvedPatternSettings.volumeExpansion.volumeMultiplier * 12 - 15}
                  width="110"
                  height="14"
                  rx="3"
                  fill="#eab308"
                  fillOpacity="0.15"
                />
                <text
                  x="265"
                  y={215 - resolvedPatternSettings.volumeExpansion.volumeMultiplier * 12 - 4}
                  fill="#eab308"
                  className="text-[9px] font-mono font-bold"
                >
                  Min Vol: {resolvedPatternSettings.volumeExpansion.volumeMultiplier.toFixed(1)}× avg
                </text>
              </g>
            ) : null}

            {/* Threshold Ruler */}
            <g>
              <line x1="28" y1={190 - thresholdPixelHeight} x2="28" y2="190" stroke="currentColor" className="text-accent" strokeWidth="1.5" opacity="0.8" />
              <line x1="22" y1={190 - thresholdPixelHeight} x2="34" y2={190 - thresholdPixelHeight} stroke="currentColor" className="text-accent" strokeWidth="1.5" />
              <line x1="22" y1="190" x2="34" y2="190" stroke="currentColor" className="text-accent" strokeWidth="1.5" />
              <text x="10" y="206" className="text-[9px] fill-accent font-mono font-bold">
                MIN {visualThreshold.toFixed(2)}%
              </text>
            </g>

            {/* Engulfing Bracket Callout */}
            {isEngulfingReversal ? (
              <g>
                <rect x="235" y="55" width="70" height="125" rx="6" fill="#3b82f6" fillOpacity="0.08" stroke="#3b82f6" strokeWidth="1" strokeDasharray="3 3" />
                <text x="270" y="46" textAnchor="middle" fill="#3b82f6" className="text-[10px] font-mono font-bold">
                  ENGULFS PRIOR BODY
                </text>
              </g>
            ) : null}

            {/* Render Candles */}
            {candleGeometry.map((c) => {
              const { xCenter, bodyPixelHeight, bodyY } = c;
              const candleBullish = c.candleIsBullish;
              const colorClass = candleBullish ? '#10b981' : '#ef4444';
              const wickHeight = 10;
              const highY = bodyY - wickHeight;
              const lowY = bodyY + bodyPixelHeight + wickHeight;

              return (
                <g key={c.index} className="transition-all duration-300">
                  {/* Wick */}
                  <line x1={xCenter} y1={highY} x2={xCenter} y2={lowY} stroke={colorClass} strokeWidth="2" />

                  {/* Body Rect */}
                  <rect
                    x={xCenter - 18}
                    y={bodyY}
                    width="36"
                    height={Math.max(4, bodyPixelHeight)}
                    rx="3"
                    fill={colorClass}
                    fillOpacity={c.passesSize && c.passesDirection ? '0.9' : '0.4'}
                    stroke={colorClass}
                    strokeWidth="1.5"
                  />

                  {/* Move Percentage Tag above Candle */}
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

                  {/* Volume Bar (for Volume Expansion) */}
                  {isVolumeExpansion && 'volume' in c ? (
                    <g>
                      <rect
                        x={xCenter - 12}
                        y={215 - (c as { volume?: number }).volume! * 12}
                        width="24"
                        height={(c as { volume?: number }).volume! * 12}
                        rx="2"
                        fill={colorClass}
                        fillOpacity="0.7"
                      />
                      <text x={xCenter} y="228" textAnchor="middle" className="text-[9px] font-mono fill-muted">
                        {(c as { volume?: number }).volume!.toFixed(1)}× Vol
                      </text>
                    </g>
                  ) : (
                    <text x={xCenter} y="222" textAnchor="middle" className="text-[9px] font-mono fill-muted">
                      {c.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

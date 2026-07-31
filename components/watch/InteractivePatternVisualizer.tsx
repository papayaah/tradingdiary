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
import type { PatternId } from '@/lib/scanner/patterns';

interface InteractivePatternVisualizerProps {
  patternId: PatternId;
  minMovePercent?: number;
  requiredCount?: number;
  maxBodyOverlapPercent?: number;
  onMinMoveChange?: (val: number) => void;
  onRequiredCountChange?: (val: number) => void;
  onMaxBodyOverlapChange?: (val: number) => void;
}

export function InteractivePatternVisualizer({
  patternId,
  minMovePercent = 0.25,
  requiredCount = 3,
  maxBodyOverlapPercent = 100,
  onMinMoveChange,
  onRequiredCountChange,
  onMaxBodyOverlapChange,
}: InteractivePatternVisualizerProps) {
  const [direction, setDirection] = useState<'bullish' | 'bearish'>('bullish');
  const [simScenario, setSimScenario] = useState<'valid' | 'fail-size' | 'fail-direction'>('valid');
  const [localMinMove, setLocalMinMove] = useState<number>(minMovePercent);
  const [localStreak, setLocalStreak] = useState<number>(requiredCount);
  const [localMaxOverlap, setLocalMaxOverlap] = useState<number>(
    maxBodyOverlapPercent,
  );
  const [showExplanation, setShowExplanation] = useState<boolean>(true);

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

  const streak = patternId === 'consecutive' ? localStreak : 3;
  const targetThreshold = localMinMove;
  const isBullish = direction === 'bullish';

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
    const passesDirection = candleIsBullish === isBullish;

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
    const overlapPixels = index === 0
      ? 0
      : Math.min(previousBodyHeight, height) * (localMaxOverlap / 100);
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
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              Visual Pattern Simulator: <span className="text-accent capitalize">{patternId.replace('-', ' ')}</span>
            </h4>
            <p className="text-[11px] text-muted">
              Move the slider to watch candle bodies grow/shrink to match your size threshold.
            </p>
          </div>
        </div>

        {/* Direction & Scenario Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-card-border bg-muted-bg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setDirection('bullish')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                direction === 'bullish'
                  ? 'bg-profit/15 text-profit'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              <TrendingUp size={13} />
              Bullish
            </button>
            <button
              type="button"
              onClick={() => setDirection('bearish')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                direction === 'bearish'
                  ? 'bg-loss/15 text-loss'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              <TrendingDown size={13} />
              Bearish
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowExplanation((prev) => !prev)}
            className="flex items-center gap-1 rounded-lg border border-card-border bg-muted-bg px-2.5 py-1 text-[11px] font-medium text-muted hover:text-foreground transition-colors"
          >
            <HelpCircle size={13} />
            {showExplanation ? 'Hide Guide' : 'How it works'}
          </button>
        </div>
      </div>

      {/* Interactive Controls Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-muted-bg/40 p-3 rounded-lg border border-card-border/60">
        {/* Threshold Slider */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="min-move-slider" className="font-medium text-muted flex items-center gap-1">
              <Sliders size={12} className="text-accent" />
              Min Move per Candle:
            </label>
            <span className="font-mono font-bold text-accent text-sm">{localMinMove.toFixed(2)}%</span>
          </div>
          <input
            id="min-move-slider"
            type="range"
            min="0.05"
            max="1.50"
            step="0.05"
            value={localMinMove}
            onChange={(e) => handleMinMoveUpdate(parseFloat(e.target.value))}
            className="w-full h-2 bg-card-border rounded-lg appearance-none cursor-pointer accent-accent"
          />
          <div className="flex justify-between text-[9px] text-muted font-mono">
            <span>0.05% (Small/Squatty)</span>
            <span>0.25% (Standard)</span>
            <span>1.50% (Large Explosion)</span>
          </div>
        </div>

        {/* Streak Selector (for consecutive) */}
        {patternId === 'consecutive' ? (
          <div className="space-y-1">
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

        {patternId === 'consecutive' ? (
          <div className="space-y-1">
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
        <div className="space-y-1 sm:col-span-2 lg:col-span-1">
          <span className="block text-xs font-medium text-muted">Test Scenario:</span>
          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={() => setSimScenario('valid')}
              className={`px-2 py-1 rounded border text-[10px] font-semibold text-center transition-colors ${
                simScenario === 'valid'
                  ? 'border-profit bg-profit/15 text-profit'
                  : 'border-card-border bg-card-bg text-muted hover:text-foreground'
              }`}
            >
              Valid Trigger
            </button>
            <button
              type="button"
              onClick={() => setSimScenario('fail-size')}
              className={`px-2 py-1 rounded border text-[10px] font-semibold text-center transition-colors ${
                simScenario === 'fail-size'
                  ? 'border-loss bg-loss/15 text-loss'
                  : 'border-card-border bg-card-bg text-muted hover:text-foreground'
              }`}
            >
              Body Too Small
            </button>
            <button
              type="button"
              onClick={() => setSimScenario('fail-direction')}
              className={`px-2 py-1 rounded border text-[10px] font-semibold text-center transition-colors ${
                simScenario === 'fail-direction'
                  ? 'border-loss bg-loss/15 text-loss'
                  : 'border-card-border bg-card-bg text-muted hover:text-foreground'
              }`}
            >
              Broken Streak
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Candlestick Diagram SVG */}
      <div className="relative rounded-lg border border-card-border/80 bg-background/80 p-4">
        {/* Status Badge */}
        <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold border">
          {allPass ? (
            <span className="flex items-center gap-1 text-profit border-profit/30 bg-profit/10 px-2 py-0.5 rounded-full">
              <CheckCircle2 size={13} />
              PATTERN DETECTED ({totalMove >= 0 ? '+' : ''}{totalMove.toFixed(2)}%)
            </span>
          ) : (
            <span className="flex items-center gap-1 text-loss border-loss/30 bg-loss/10 px-2 py-0.5 rounded-full">
              <XCircle size={13} />
              IGNORED (Threshold Not Met)
            </span>
          )}
        </div>

        <div className="text-[11px] font-medium text-muted mb-1">
          Trigger Preview ({simulatedCandles.length} Bars) — {localMaxOverlap === 0 ? 'clean staircase' : `≤${localMaxOverlap}% body overlap`}, closes progress {isBullish ? 'higher' : 'lower'}
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
        </div>
      ) : null}
    </div>
  );
}

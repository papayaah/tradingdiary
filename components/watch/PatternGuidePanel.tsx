'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ScanSearch, ChevronDown, SlidersHorizontal, Check } from 'lucide-react';
import {
  DEFAULT_PATTERN_SETTINGS,
  normalizePatternSettings,
  PATTERN_PRESETS,
  type PatternId,
  type PatternSettings,
} from '@/lib/scanner/patterns';
import { InteractivePatternVisualizer } from './InteractivePatternVisualizer';
import { DETECTOR_RULE_GUIDANCE } from './pattern-settings/detectorGuidance';

interface PatternGuidePanelProps {
  value: PatternId;
  onChange: (patternId: PatternId) => void;
  description?: string;
  minMovePercent?: number;
  requiredCount?: number;
  maxBodyOverlapPercent?: number;
  onMinMoveChange?: (val: number) => void;
  onRequiredCountChange?: (val: number) => void;
  onMaxBodyOverlapChange?: (val: number) => void;
  patternSettings?: PatternSettings;
  onPatternSettingsChange?: (settings: PatternSettings) => void;
}

interface PreviewCandle {
  open: number;
  close: number;
  high: number;
  low: number;
  volume?: number;
}

const PREVIEW_CANDLES: Record<PatternId, PreviewCandle[]> = {
  consecutive: [
    { open: 22, close: 19, high: 17, low: 25 },
    { open: 19, close: 15, high: 13, low: 21 },
    { open: 15, close: 10, high: 8, low: 17 },
    { open: 10, close: 5, high: 3, low: 12 },
  ],
  'momentum-burst': [
    { open: 21, close: 19, high: 17, low: 23 },
    { open: 19, close: 21, high: 17, low: 23 },
    { open: 20, close: 18, high: 16, low: 22 },
    { open: 19, close: 5, high: 3, low: 21 },
  ],
  'range-breakout': [
    { open: 19, close: 16, high: 13, low: 22 },
    { open: 16, close: 20, high: 13, low: 23 },
    { open: 20, close: 15, high: 12, low: 22 },
    { open: 14, close: 5, high: 3, low: 16 },
  ],
  'volume-expansion': [
    { open: 20, close: 18, high: 16, low: 22, volume: 4 },
    { open: 19, close: 21, high: 17, low: 23, volume: 5 },
    { open: 20, close: 17, high: 15, low: 22, volume: 4 },
    { open: 18, close: 7, high: 5, low: 20, volume: 12 },
  ],
  'engulfing-reversal': [
    { open: 10, close: 14, high: 8, low: 16 },
    { open: 14, close: 18, high: 12, low: 20 },
    { open: 18, close: 22, high: 16, low: 24 },
    { open: 23, close: 13, high: 11, low: 25 },
  ],
};

const PatternPreview = React.memo(function PatternPreview({
  patternId,
  large = false,
}: {
  patternId: PatternId;
  large?: boolean;
}) {
  const candles = PREVIEW_CANDLES[patternId];
  const showRange = patternId === 'range-breakout';
  const showVolume = patternId === 'volume-expansion';

  return (
    <svg
      viewBox={showRange ? '0 0 76 28' : showVolume ? '0 0 62 38' : '0 0 62 28'}
      className={large ? 'h-14 w-[120px] shrink-0' : 'h-9 w-[76px] shrink-0'}
      role="img"
      aria-label={`${patternId.replaceAll('-', ' ')} candlestick example`}
    >
      {showRange ? (
        <line x1="2" y1="12" x2="51" y2="12" stroke="#64748b" strokeWidth="1" strokeDasharray="2 2" opacity="0.75" />
      ) : null}
      {candles.map((candle, index) => {
        const x = 8 + index * 16;
        const bullish = candle.close < candle.open;
        const color = bullish ? '#34d399' : '#fb7185';
        return (
          <g key={x}>
            <line x1={x} y1={candle.high} x2={x} y2={candle.low} stroke={color} strokeWidth="1.25" />
            <rect
              x={x - 3}
              y={Math.min(candle.open, candle.close)}
              width="6"
              height={Math.max(2, Math.abs(candle.close - candle.open))}
              rx="0.75"
              fill={color}
            />
            {showVolume ? (
              <rect
                x={x - 4}
                y={38 - (candle.volume ?? 0)}
                width="8"
                height={candle.volume ?? 0}
                rx="0.5"
                fill={color}
                opacity="0.45"
              />
            ) : null}
          </g>
        );
      })}
      {showRange ? (
        <g fill="none" stroke="#34d399" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
          <line x1="69" y1="22" x2="69" y2="4" />
          <polyline points="64,9 69,4 74,9" />
        </g>
      ) : null}
    </svg>
  );
});

export function PatternGuidePanel({
  value,
  onChange,
  description = 'Choose one detector for every symbol in this watchlist.',
  minMovePercent = 0.25,
  requiredCount = 3,
  maxBodyOverlapPercent = 100,
  onMinMoveChange,
  onRequiredCountChange,
  onMaxBodyOverlapChange,
  patternSettings = DEFAULT_PATTERN_SETTINGS,
  onPatternSettingsChange,
}: PatternGuidePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGuideExpanded, setIsGuideExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedPreset = PATTERN_PRESETS.find((preset) => preset.id === value) ?? PATTERN_PRESETS[0];
  const ruleGuidance = DETECTOR_RULE_GUIDANCE[value];
  const resolvedPatternSettings = React.useMemo(
    () => normalizePatternSettings(patternSettings),
    [patternSettings],
  );

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <section
      ref={containerRef}
      className="relative z-30 mb-3 space-y-2 rounded-xl border border-card-border/60 bg-muted-bg/20 p-2.5 shadow-sm"
      aria-labelledby="pattern-selector-title"
    >
      {/* Top Header: Left Title/Subtitle + Right Flushed Trigger Button & Parameters Toggle */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center justify-between">
        <div>
          <div id="pattern-selector-title" className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <ScanSearch size={14} className="text-accent" />
            Pattern
          </div>
          <p className="mt-0.5 text-[10px] text-muted">{description}</p>
        </div>

        {/* Flushed to Right: Trigger Button + Parameter Pills + Icon Toggle */}
        <div className="flex items-center gap-2 sm:ml-auto">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-controls="pattern-selector-options"
            onClick={() => setIsOpen((open) => !open)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-accent/40 bg-card-bg/90 px-2 py-1.5 text-left transition-all hover:border-accent hover:bg-card-bg shadow-sm sm:w-[360px]"
          >
            <PatternPreview patternId={selectedPreset.id} />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-foreground">{selectedPreset.name}</span>
              <span className="mt-0.5 block truncate text-[10px] text-muted">{selectedPreset.shortDescription}</span>
            </span>
            <ChevronDown
              size={15}
              className={`shrink-0 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Parameter summary pill (Tapping expands visualizer) */}
          <button
            type="button"
            onClick={() => setIsGuideExpanded((exp) => !exp)}
            className="hidden lg:flex items-center gap-1.5 text-[10px] font-mono text-muted bg-card-bg border border-card-border/60 px-2.5 py-1.5 rounded-lg hover:border-accent/40 hover:text-foreground transition-all cursor-pointer shadow-sm"
            title="Click to expand Pattern Settings & Visualizer"
          >
            <span>{ruleGuidance.minBodySummaryLabel}: <strong className="text-foreground">{minMovePercent}%</strong></span>
            {value === 'consecutive' && (
              <span>• Streak: <strong className="text-foreground">{requiredCount} bars</strong></span>
            )}
            {value === 'momentum-burst' && (
              <>
                <span>• Baseline: <strong className="text-foreground">{resolvedPatternSettings.momentumBurst.lookbackBars} bars</strong></span>
                <span>• Expansion: <strong className="text-foreground">{resolvedPatternSettings.momentumBurst.bodyMultiplier.toFixed(1)}×</strong></span>
              </>
            )}
            {value === 'range-breakout' && (
              <>
                <span>• Range: <strong className="text-foreground">{resolvedPatternSettings.rangeBreakout.lookbackBars} bars</strong></span>
                <span>• Buffer: <strong className="text-foreground">{resolvedPatternSettings.rangeBreakout.minBreakoutPercent.toFixed(2)}%</strong></span>
                {resolvedPatternSettings.rangeBreakout.volumeConfirmationMultiplier !== null ? (
                  <span>• Vol: <strong className="text-foreground">{resolvedPatternSettings.rangeBreakout.volumeConfirmationMultiplier}×</strong></span>
                ) : null}
              </>
            )}
            {value === 'volume-expansion' && (
              <>
                <span>• Baseline: <strong className="text-foreground">{resolvedPatternSettings.volumeExpansion.lookbackBars} bars</strong></span>
                <span>• Volume: <strong className="text-foreground">{resolvedPatternSettings.volumeExpansion.volumeMultiplier.toFixed(1)}×</strong></span>
                <span>• Coverage: <strong className="text-foreground">{resolvedPatternSettings.volumeExpansion.minCoveragePercent}%</strong></span>
              </>
            )}
            {value === 'engulfing-reversal' && (
              <>
                {resolvedPatternSettings.engulfingReversal.minPriorBodyPercent > 0 ? (
                  <span>• Prior body: <strong className="text-foreground">{resolvedPatternSettings.engulfingReversal.minPriorBodyPercent.toFixed(2)}%</strong></span>
                ) : null}
                <span>• Strength: <strong className="text-foreground">{resolvedPatternSettings.engulfingReversal.minBodyRatio.toFixed(1)}×</strong></span>
              </>
            )}
          </button>

          {/* Minimal Icon Toggle */}
          <button
            type="button"
            onClick={() => setIsGuideExpanded((exp) => !exp)}
            className={`p-1.5 rounded-lg border transition-all shadow-sm ${
              isGuideExpanded
                ? 'bg-accent/15 border-accent/50 text-accent'
                : 'bg-card-bg border-card-border/60 text-muted hover:text-foreground hover:border-accent/40'
            }`}
            title={isGuideExpanded ? 'Hide Settings & Visualizer' : 'Show Pattern Settings & Visualizer'}
          >
            <SlidersHorizontal size={14} />
          </button>
        </div>
      </div>

      {/* Full-Width Expanded Dropdown Menu Overlay (Matching Original Full-Width Box) */}
      {isOpen ? (
        <div
          id="pattern-selector-options"
          className="relative z-50 w-full rounded-xl border border-accent/40 bg-[#0f172a] p-2.5 shadow-2xl space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150"
          role="listbox"
          aria-label="Pattern"
        >
          <div className="px-1 text-[9px] font-bold uppercase tracking-wider text-muted">
            SELECT A PATTERN
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {PATTERN_PRESETS.map((preset) => {
              const selected = preset.id === value;
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(preset.id);
                    setIsOpen(false);
                  }}
                  className={`relative flex min-h-[70px] items-center gap-2.5 rounded-lg border p-2 text-left transition-all ${
                    selected
                      ? 'border-accent bg-accent/15 text-foreground shadow-md ring-1 ring-accent/30'
                      : 'border-card-border/60 bg-[#162032] text-muted hover:border-accent/50 hover:bg-[#1e293b] hover:text-foreground'
                  }`}
                >
                  <PatternPreview patternId={preset.id} large />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold leading-tight text-foreground">{preset.name}</span>
                    <span className="mt-1 block text-[10px] leading-snug text-muted">{preset.shortDescription}</span>
                  </span>
                  {selected ? (
                    <span className="absolute right-2.5 top-2.5 grid h-4.5 w-4.5 place-items-center rounded-full bg-accent text-white shadow-sm">
                      <Check size={10} strokeWidth={3} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Expandable Settings & Visualizer Drawer */}
      {isGuideExpanded && (
        <div className="pt-2 border-t border-card-border/40 animate-in fade-in slide-in-from-top-1 duration-200">
          <InteractivePatternVisualizer
            patternId={value}
            minMovePercent={minMovePercent}
            requiredCount={requiredCount}
            maxBodyOverlapPercent={maxBodyOverlapPercent}
            onMinMoveChange={onMinMoveChange}
            onRequiredCountChange={onRequiredCountChange}
            onMaxBodyOverlapChange={onMaxBodyOverlapChange}
            patternSettings={resolvedPatternSettings}
            onPatternSettingsChange={onPatternSettingsChange}
          />
        </div>
      )}
    </section>
  );
}

export default React.memo(PatternGuidePanel);

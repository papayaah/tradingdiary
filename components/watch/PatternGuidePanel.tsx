'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ScanSearch, ChevronDown, SlidersHorizontal, Check } from 'lucide-react';
import {
  PATTERN_PRESETS,
  DEFAULT_PATTERN_SETTINGS,
  getPatternMinMovePercent,
  getPatternDefinition,
  normalizePatternSettings,
  type PatternId,
  type PatternSettings,
} from '@/lib/scanner/patterns';
import { DETECTOR_RULE_GUIDANCE } from './pattern-settings/detectorGuidance';
import { InteractivePatternVisualizer } from './InteractivePatternVisualizer';
import FocusBackdrop from './FocusBackdrop';

interface PatternGuidePanelProps {
  value: PatternId;
  onChange: (patternId: PatternId) => void;
  selectedValues?: PatternId[];
  onSelectionChange?: (patternIds: PatternId[]) => void;
  description?: string;
  minMovePercent?: number;
  requiredCount?: number;
  maxBodyOverlapPercent?: number;
  patternSettings?: PatternSettings;
  onMinMoveChange?: (val: number) => void;
  onRequiredCountChange?: (val: number) => void;
  onMaxBodyOverlapChange?: (val: number) => void;
  onPatternSettingsChange?: (next: PatternSettings) => void;
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
  selectedValues,
  onSelectionChange,
  description: customDescription,
  minMovePercent = 0.25,
  requiredCount = 3,
  maxBodyOverlapPercent = 100,
  patternSettings,
  onMinMoveChange,
  onRequiredCountChange,
  onMaxBodyOverlapChange,
  onPatternSettingsChange,
}: PatternGuidePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGuideExpanded, setIsGuideExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedPreset = PATTERN_PRESETS.find((preset) => preset.id === value) ?? PATTERN_PRESETS[0];
  const alertPatternIds = selectedValues ?? [value];
  const isMultiSelect = !!onSelectionChange;

  const isFocused = isOpen || isGuideExpanded;

  useEffect(() => {
    if (!isFocused) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setIsGuideExpanded(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setIsGuideExpanded(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFocused]);

  const definition = getPatternDefinition(value);
  const description = customDescription ?? (isMultiSelect
    ? 'Choose one or more detectors. Alerts fire when any selected pattern matches.'
    : definition?.shortDescription ?? selectedPreset.shortDescription);
  const resolvedPatternSettings = normalizePatternSettings(patternSettings ?? DEFAULT_PATTERN_SETTINGS);
  const activeMinMovePercent = getPatternMinMovePercent(
    resolvedPatternSettings,
    value,
    minMovePercent,
  );
  const ruleGuidance = DETECTOR_RULE_GUIDANCE[value] ?? { minBodySummaryLabel: 'Min Body' };

  return (
    <>
      {isFocused ? (
        <FocusBackdrop
          label="Close pattern controls"
          onDismiss={() => {
            setIsOpen(false);
            setIsGuideExpanded(false);
          }}
        />
      ) : null}
      <section
        ref={containerRef}
        className={`relative mb-3 space-y-2 rounded-xl border bg-card-bg p-2.5 transition-shadow ${
          isFocused
            ? 'z-[100] border-accent/50 shadow-2xl shadow-background'
            : 'z-30 border-card-border/60 shadow-sm'
        }`}
        aria-labelledby="pattern-selector-title"
      >
      {/* Top Header: Left Title/Subtitle + Right Flushed Trigger Button & Parameters Toggle */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center justify-between">
        <div>
          <div id="pattern-selector-title" className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <ScanSearch size={14} className="text-accent" />
            {isMultiSelect ? 'Alert Patterns' : 'Pattern'}
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
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-accent/40 bg-card-bg px-2 py-1.5 text-left transition-all hover:border-accent shadow-sm sm:w-[360px]"
          >
            <PatternPreview patternId={selectedPreset.id} />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-foreground">{selectedPreset.name}</span>
              <span className="mt-0.5 block truncate text-[10px] text-muted">
                {isMultiSelect
                  ? `${alertPatternIds.length} alert pattern${alertPatternIds.length === 1 ? '' : 's'} selected`
                  : selectedPreset.shortDescription}
              </span>
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
            className="hidden lg:flex items-center gap-1.5 text-[10px] font-mono text-muted bg-muted-bg/50 border border-card-border/60 px-2.5 py-1.5 rounded-lg hover:border-accent/40 hover:text-foreground transition-all cursor-pointer shadow-sm"
            title="Click to expand Pattern Settings & Visualizer"
          >
            <span>{ruleGuidance.minBodySummaryLabel}: <strong className="text-foreground">{activeMinMovePercent}%</strong></span>
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
              </>
            )}
            {value === 'volume-expansion' && (
              <>
                <span>• Baseline: <strong className="text-foreground">{resolvedPatternSettings.volumeExpansion.lookbackBars} bars</strong></span>
                <span>• Volume: <strong className="text-foreground">{resolvedPatternSettings.volumeExpansion.volumeMultiplier.toFixed(1)}×</strong></span>
              </>
            )}
            {value === 'engulfing-reversal' && (
              <>
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

      {/* Semantic Theme Dropdown Overlay (Works in both Light & Dark themes) */}
      {isOpen ? (
        <div
          id="pattern-selector-options"
          className="relative z-50 w-full rounded-xl border border-card-border bg-card-bg p-2.5 shadow-2xl space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150"
          role={isMultiSelect ? 'group' : 'listbox'}
          aria-label={isMultiSelect ? 'Alert patterns and active pattern settings' : 'Pattern'}
        >
          <div className="flex items-center justify-between gap-3 px-1">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted">
                {isMultiSelect ? 'SELECT ALERT PATTERNS' : 'SELECT A PATTERN'}
              </div>
              {isMultiSelect ? (
                <p className="mt-0.5 text-[10px] text-muted">Alert when any checked pattern matches. Click a card to edit its settings.</p>
              ) : null}
            </div>
            {isMultiSelect ? (
              <button
                type="button"
                onClick={() => onSelectionChange(
                  alertPatternIds.length === PATTERN_PRESETS.length
                    ? [value]
                    : PATTERN_PRESETS.map((preset) => preset.id),
                )}
                className="shrink-0 rounded-lg border border-card-border bg-muted-bg/50 px-2 py-1 text-[10px] font-semibold text-foreground transition-colors hover:border-accent/50"
              >
                {alertPatternIds.length === PATTERN_PRESETS.length ? 'Only active' : 'Select all'}
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {PATTERN_PRESETS.map((preset) => {
              const active = preset.id === value;
              const checked = alertPatternIds.includes(preset.id);
              const toggleAlertPattern = () => {
                if (!onSelectionChange || (checked && alertPatternIds.length === 1)) return;
                const next = checked
                  ? alertPatternIds.filter((patternId) => patternId !== preset.id)
                  : [...alertPatternIds, preset.id];
                onSelectionChange(next);
              };
              return (
                <div
                  key={preset.id}
                  className={`relative rounded-lg border transition-all ${
                    active
                      ? 'border-accent bg-accent/10 text-foreground shadow-md ring-1 ring-accent/30'
                      : 'border-card-border/60 bg-muted-bg/30 text-muted hover:border-accent/50 hover:bg-muted-bg/60 hover:text-foreground'
                  }`}
                >
                  <button
                    type="button"
                    role={isMultiSelect ? undefined : 'option'}
                    aria-selected={isMultiSelect ? undefined : checked}
                    aria-label={isMultiSelect ? `Edit ${preset.name} settings` : undefined}
                    onClick={() => {
                      onChange(preset.id);
                      if (!isMultiSelect) setIsOpen(false);
                    }}
                    className="flex min-h-[70px] w-full items-center gap-2.5 p-2 pr-9 text-left"
                  >
                    <PatternPreview patternId={preset.id} large />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold leading-tight text-foreground">{preset.name}</span>
                      <span className="mt-1 block text-[10px] leading-snug text-muted">{preset.shortDescription}</span>
                    </span>
                  </button>
                  {isMultiSelect ? (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      aria-label={`${checked ? 'Disable' : 'Enable'} ${preset.name} alerts`}
                      onClick={toggleAlertPattern}
                      disabled={checked && alertPatternIds.length === 1}
                      title={checked && alertPatternIds.length === 1 ? 'At least one alert pattern is required' : undefined}
                      className={`absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                        checked
                          ? 'border-accent bg-accent text-background'
                          : 'border-card-border bg-card-bg text-transparent'
                      }`}
                    >
                      <Check size={11} strokeWidth={3} />
                    </button>
                  ) : active ? (
                    <span
                      aria-hidden="true"
                      className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-background shadow-sm"
                    >
                      <Check size={11} strokeWidth={3} />
                    </span>
                  ) : null}
                </div>
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
            minMovePercent={activeMinMovePercent}
            requiredCount={requiredCount}
            maxBodyOverlapPercent={maxBodyOverlapPercent}
            patternSettings={patternSettings}
            onMinMoveChange={(nextMinMovePercent) => {
              if (onPatternSettingsChange) {
                onPatternSettingsChange({
                  ...resolvedPatternSettings,
                  minMovePercentByPattern: {
                    ...resolvedPatternSettings.minMovePercentByPattern,
                    [value]: nextMinMovePercent,
                  },
                });
                return;
              }
              onMinMoveChange?.(nextMinMovePercent);
            }}
            onRequiredCountChange={onRequiredCountChange}
            onMaxBodyOverlapChange={onMaxBodyOverlapChange}
            onPatternSettingsChange={onPatternSettingsChange}
          />
        </div>
      )}
      </section>
    </>
  );
}

export default React.memo(PatternGuidePanel);

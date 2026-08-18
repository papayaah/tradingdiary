'use client';

import React from 'react';
import { ChartNoAxesCombined, Minus, Sparkles } from 'lucide-react';

interface ChartOverlayControlsProps {
  patternsEnabled: boolean;
  levelsEnabled: boolean;
  trendlinesEnabled: boolean;
  onTogglePatterns: () => void;
  onToggleLevels: () => void;
  onToggleTrendlines: () => void;
}

const buttonClass = (enabled: boolean) =>
  `flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-all ${
    enabled
      ? 'bg-accent text-white shadow-sm ring-1 ring-accent'
      : 'text-muted hover:bg-card-bg/60 hover:text-foreground'
  }`;

export default function ChartOverlayControls({
  patternsEnabled,
  levelsEnabled,
  trendlinesEnabled,
  onTogglePatterns,
  onToggleLevels,
  onToggleTrendlines,
}: ChartOverlayControlsProps) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-xl border border-card-border/40 bg-muted-bg/50 p-0.5"
      aria-label="Chart overlays for all Market Watch charts"
    >
      <button
        type="button"
        aria-pressed={patternsEnabled}
        onClick={onTogglePatterns}
        className={buttonClass(patternsEnabled)}
        title={`${patternsEnabled ? 'Hide' : 'Show'} patterns on all Market Watch charts`}
      >
        <Sparkles size={14} className={patternsEnabled ? 'text-white' : 'text-accent'} />
        <span>Patterns</span>
      </button>
      <button
        type="button"
        aria-pressed={levelsEnabled}
        onClick={onToggleLevels}
        className={buttonClass(levelsEnabled)}
        title={`${levelsEnabled ? 'Hide' : 'Show'} support and resistance levels on all Market Watch charts`}
      >
        <Minus size={14} />
        <span>Levels</span>
      </button>
      <button
        type="button"
        aria-pressed={trendlinesEnabled}
        onClick={onToggleTrendlines}
        className={buttonClass(trendlinesEnabled)}
        title={`${trendlinesEnabled ? 'Hide' : 'Show'} trendlines on all Market Watch charts`}
      >
        <ChartNoAxesCombined size={14} className={trendlinesEnabled ? 'text-white' : 'text-accent'} />
        <span>Trendlines</span>
      </button>
    </div>
  );
}

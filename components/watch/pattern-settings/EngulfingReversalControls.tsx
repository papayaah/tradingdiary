'use client';

import React from 'react';
import type { EngulfingReversalSettings } from '@/lib/scanner/patterns';

interface EngulfingReversalControlsProps {
  value: EngulfingReversalSettings;
  onChange?: (value: EngulfingReversalSettings) => void;
}

export function EngulfingReversalControls({
  value,
  onChange,
}: EngulfingReversalControlsProps) {
  const update = (patch: Partial<EngulfingReversalSettings>) => {
    onChange?.({ ...value, ...patch });
  };

  return (
    <div className="basis-full rounded-lg border border-accent/20 bg-accent/5 p-3">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-foreground">
        Engulfing Reversal controls
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted">Minimum Prior-Candle Body</span>
            <span className="font-mono text-xs font-bold text-accent">
              {value.minPriorBodyPercent === 0 ? 'Off' : `${value.minPriorBodyPercent.toFixed(2)}%`}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={value.minPriorBodyPercent}
            onChange={(event) => update({ minPriorBodyPercent: Number(event.target.value) })}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-card-border accent-accent"
            aria-label="Minimum prior candle body percent"
          />
          <p className="text-[9px] text-muted">Filters reversals that only engulf a tiny or nearly doji-like prior body.</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted">Minimum Engulfing Strength</span>
            <span className="font-mono text-xs font-bold text-accent">
              {value.minBodyRatio.toFixed(1)}× prior body
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="3"
            step="0.1"
            value={value.minBodyRatio}
            onChange={(event) => update({ minBodyRatio: Number(event.target.value) })}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-card-border accent-accent"
            aria-label="Minimum engulfing body ratio"
          />
          <div className="flex justify-between text-[9px] font-mono text-muted">
            <span>1× classic</span>
            <span>2× strong</span>
            <span>3× rare</span>
          </div>
        </div>
      </div>
    </div>
  );
}

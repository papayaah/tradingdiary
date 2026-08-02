'use client';

import React from 'react';
import type { VolumeExpansionSettings } from '@/lib/scanner/patterns';

interface VolumeExpansionControlsProps {
  value: VolumeExpansionSettings;
  onChange?: (value: VolumeExpansionSettings) => void;
}

const optionClass = (selected: boolean) => `rounded-md border px-2 py-1 text-[10px] font-bold transition-colors ${
  selected
    ? 'border-accent bg-accent/15 text-accent'
    : 'border-card-border bg-card-bg text-muted hover:text-foreground'
}`;

export function VolumeExpansionControls({
  value,
  onChange,
}: VolumeExpansionControlsProps) {
  const update = (patch: Partial<VolumeExpansionSettings>) => {
    onChange?.({ ...value, ...patch });
  };

  return (
    <div className="basis-full rounded-lg border border-accent/20 bg-accent/5 p-3">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-foreground">
        Volume Expansion controls
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-muted">Volume Baseline</span>
          <div className="grid grid-cols-4 gap-1">
            {[5, 10, 20, 50].map((bars) => (
              <button
                key={bars}
                type="button"
                onClick={() => update({ lookbackBars: bars })}
                className={optionClass(value.lookbackBars === bars)}
              >
                {bars} bars
              </button>
            ))}
          </div>
          <p className="text-[9px] text-muted">Longer baselines reduce sensitivity to short-lived volume changes.</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted">Required Relative Volume</span>
            <span className="font-mono text-xs font-bold text-accent">
              {value.volumeMultiplier.toFixed(1)}×
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="5"
            step="0.1"
            value={value.volumeMultiplier}
            onChange={(event) => update({ volumeMultiplier: Number(event.target.value) })}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-card-border accent-accent"
            aria-label="Required relative volume multiplier"
          />
          <div className="flex justify-between text-[9px] font-mono text-muted">
            <span>1× permissive</span>
            <span>2× standard</span>
            <span>5× rare</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-muted">Minimum Baseline Coverage</span>
          <div className="grid grid-cols-3 gap-1">
            {[
              { value: 60, label: '60% Flexible' },
              { value: 80, label: '80% Standard' },
              { value: 100, label: '100% Strict' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => update({ minCoveragePercent: option.value })}
                className={optionClass(value.minCoveragePercent === option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-muted">Rejects signals when too many baseline bars have missing or zero volume.</p>
        </div>
      </div>
    </div>
  );
}

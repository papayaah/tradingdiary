'use client';

import React from 'react';
import type { VolumeExpansionSettings } from '@/lib/scanner/patterns';

interface VolumeExpansionControlsProps {
  value: VolumeExpansionSettings;
  onChange?: (value: VolumeExpansionSettings) => void;
}

const optionClass = (selected: boolean) => `rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
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
    <div className="basis-full rounded-xl border border-accent/20 bg-accent/5 p-3.5 space-y-3">
      <div className="text-xs font-bold uppercase tracking-wider text-foreground">
        Volume Expansion controls
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-foreground">Volume Baseline</span>
          <div className="grid grid-cols-4 gap-1.5">
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
          <p className="text-xs text-muted">Longer baselines reduce sensitivity to short-lived volume changes.</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-foreground">Required Relative Volume</span>
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
            className="w-full accent-accent cursor-pointer"
            aria-label="Required relative volume multiplier"
          />
          <div className="flex justify-between text-xs font-mono text-muted">
            <span>1× permissive</span>
            <span>2× standard</span>
            <span>5× rare</span>
          </div>
        </div>

        <div className="space-y-2">
          <span className="block text-xs font-semibold text-foreground">Minimum Baseline Coverage</span>
          <div className="grid grid-cols-3 gap-1.5">
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
          <p className="text-xs text-muted">Rejects signals when too many baseline bars have missing or zero volume.</p>
        </div>
      </div>
    </div>
  );
}

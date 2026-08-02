'use client';

import React from 'react';
import type { MomentumBurstSettings } from '@/lib/scanner/patterns';

interface MomentumBurstControlsProps {
  value: MomentumBurstSettings;
  onChange?: (value: MomentumBurstSettings) => void;
}

const optionClass = (selected: boolean) => `rounded-md border px-2 py-1 text-[10px] font-bold transition-colors ${
  selected
    ? 'border-accent bg-accent/15 text-accent'
    : 'border-card-border bg-card-bg text-muted hover:text-foreground'
}`;

export function MomentumBurstControls({
  value,
  onChange,
}: MomentumBurstControlsProps) {
  const update = (patch: Partial<MomentumBurstSettings>) => {
    onChange?.({ ...value, ...patch });
  };

  return (
    <div className="basis-full rounded-lg border border-accent/20 bg-accent/5 p-3">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-foreground">
        Momentum Burst controls
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-muted">Body Baseline</span>
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
          <p className="text-[9px] text-muted">Controls how much recent price action defines a normal candle body.</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted">Required Body Expansion</span>
            <span className="font-mono text-xs font-bold text-accent">
              {value.bodyMultiplier.toFixed(1)}×
            </span>
          </div>
          <input
            type="range"
            min="1.1"
            max="5"
            step="0.1"
            value={value.bodyMultiplier}
            onChange={(event) => update({ bodyMultiplier: Number(event.target.value) })}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-card-border accent-accent"
            aria-label="Required candle body expansion multiplier"
          />
          <div className="flex justify-between text-[9px] font-mono text-muted">
            <span>1.1× sensitive</span>
            <span>1.8× standard</span>
            <span>5× rare</span>
          </div>
        </div>
      </div>
    </div>
  );
}

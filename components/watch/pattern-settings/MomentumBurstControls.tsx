'use client';

import React from 'react';
import type { MomentumBurstSettings } from '@/lib/scanner/patterns';

interface MomentumBurstControlsProps {
  value: MomentumBurstSettings;
  onChange?: (value: MomentumBurstSettings) => void;
}

const optionClass = (selected: boolean) => `rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
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
    <div className="basis-full rounded-xl border border-accent/20 bg-accent/5 p-3.5 space-y-3">
      <div className="text-xs font-bold uppercase tracking-wider text-foreground">
        Momentum Burst controls
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-foreground">Body Baseline</span>
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
          <p className="text-xs text-muted">Controls how much recent price action defines a normal candle body.</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-foreground">Required Body Expansion</span>
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
            onChange={(e) => update({ bodyMultiplier: parseFloat(e.target.value) })}
            className="w-full accent-accent cursor-pointer"
          />
          <div className="flex items-center justify-between text-[11px] text-muted font-mono">
            <span>1.1× sensitive</span>
            <span>1.8× standard</span>
            <span>5× rare</span>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import React from 'react';
import type { RangeBreakoutSettings } from '@/lib/scanner/patterns';

interface RangeBreakoutControlsProps {
  value: RangeBreakoutSettings;
  onChange?: (value: RangeBreakoutSettings) => void;
}
const optionClass = (selected: boolean) => `rounded-md border px-2 py-1 text-[10px] font-bold transition-colors ${
  selected
    ? 'border-accent bg-accent/15 text-accent'
    : 'border-card-border bg-card-bg text-muted hover:text-foreground'
}`;

export function RangeBreakoutControls({
  value,
  onChange,
}: RangeBreakoutControlsProps) {
  const update = (patch: Partial<RangeBreakoutSettings>) => {
    onChange?.({ ...value, ...patch });
  };

  return (
    <div className="basis-full rounded-lg border border-accent/20 bg-accent/5 p-3">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-foreground">
        Range Breakout controls
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-muted">Range Lookback</span>
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
          <p className="text-[9px] text-muted">Longer ranges produce fewer, more significant breaks.</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted">Minimum Close Beyond Range</span>
            <span className="font-mono text-xs font-bold text-accent">
              {value.minBreakoutPercent.toFixed(2)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={value.minBreakoutPercent}
            onChange={(event) => update({ minBreakoutPercent: Number(event.target.value) })}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-card-border accent-accent"
            aria-label="Minimum close distance beyond the range"
          />
          <p className="text-[9px] text-muted">Filters closes that barely cross the previous high or low.</p>
        </div>

        <div className="space-y-1.5">
          <label className="flex cursor-pointer items-center justify-between gap-2 text-xs font-medium text-muted">
            Require Volume Confirmation
            <input
              type="checkbox"
              checked={value.volumeConfirmationMultiplier !== null}
              onChange={(event) => update({
                volumeConfirmationMultiplier: event.target.checked ? 1.5 : null,
              })}
              className="accent-accent"
            />
          </label>
          {value.volumeConfirmationMultiplier !== null ? (
            <div className="grid grid-cols-3 gap-1">
              {[1.5, 2, 3].map((multiplier) => (
                <button
                  key={multiplier}
                  type="button"
                  onClick={() => update({ volumeConfirmationMultiplier: multiplier })}
                  className={optionClass(value.volumeConfirmationMultiplier === multiplier)}
                >
                  {multiplier}× avg
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-card-border/60 bg-card-bg px-2 py-1 text-[9px] text-muted">
              Disabled — price-only breakout
            </div>
          )}
          <p className="text-[9px] text-muted">Requires usable volume on at least 80% of lookback bars.</p>
        </div>
      </div>
    </div>
  );
}

'use client';

import React from 'react';
import type { RangeBreakoutSettings } from '@/lib/scanner/patterns';

interface RangeBreakoutControlsProps {
  value: RangeBreakoutSettings;
  onChange?: (value: RangeBreakoutSettings) => void;
}
const optionClass = (selected: boolean) => `rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
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
    <div className="basis-full rounded-xl border border-accent/20 bg-accent/5 p-3.5 space-y-3">
      <div className="text-xs font-bold uppercase tracking-wider text-foreground">
        Range Breakout controls
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-foreground">Range Lookback</span>
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
          <p className="text-xs text-muted">Longer ranges produce fewer, more significant breaks.</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-foreground">Minimum Close Beyond Range</span>
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
            className="w-full accent-accent cursor-pointer"
            aria-label="Minimum close distance beyond the range"
          />
          <p className="text-xs text-muted">Filters closes that barely cross the previous high or low.</p>
        </div>

        <div className="space-y-2">
          <label className="flex cursor-pointer items-center justify-between gap-2 text-xs font-semibold text-foreground">
            Require Volume Confirmation
            <input
              type="checkbox"
              checked={value.volumeConfirmationMultiplier !== null}
              onChange={(event) => update({
                volumeConfirmationMultiplier: event.target.checked ? 1.5 : null,
              })}
              className="accent-accent h-4 w-4"
            />
          </label>
          {value.volumeConfirmationMultiplier !== null ? (
            <div className="grid grid-cols-3 gap-1.5">
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
            <div className="rounded-lg border border-card-border/60 bg-card-bg px-2.5 py-1.5 text-xs text-muted">
              Disabled — price-only breakout
            </div>
          )}
          <p className="text-xs text-muted">Requires usable volume on at least 80% of lookback bars.</p>
        </div>
      </div>
    </div>
  );
}

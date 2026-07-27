'use client';

import type { ManualTradeFormValues } from './types';

interface BasicTradeFieldsProps {
  values: ManualTradeFormValues;
  onUpdate: <K extends keyof ManualTradeFormValues>(
    field: K,
    value: ManualTradeFormValues[K]
  ) => void;
  onNormalizeSymbol: () => void;
}

const inputClass =
  'h-12 w-full rounded-xl border border-card-border bg-background px-4 text-sm font-semibold text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15';

export function BasicTradeFields({
  values,
  onUpdate,
  onNormalizeSymbol,
}: BasicTradeFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
      <label className="space-y-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted">
          Symbol
        </span>
        <input
          autoFocus
          className={inputClass}
          value={values.symbol}
          onChange={(event) => onUpdate('symbol', event.target.value.toUpperCase())}
          onBlur={onNormalizeSymbol}
          placeholder="MNQ or AAPL"
          autoCapitalize="characters"
        />
      </label>

      <label className="space-y-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted">
          Shares / contracts
        </span>
        <input
          className={inputClass}
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={values.quantity}
          onChange={(event) => onUpdate('quantity', event.target.value)}
          placeholder="100"
        />
      </label>
    </div>
  );
}

export { inputClass };

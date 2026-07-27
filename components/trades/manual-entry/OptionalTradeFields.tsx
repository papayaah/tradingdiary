'use client';

import type { AccountRecord } from '@/lib/db/schema';
import type { ManualTradeFormValues } from './types';
import { inputClass } from './BasicTradeFields';

interface OptionalTradeFieldsProps {
  accounts: AccountRecord[];
  isFetchingQuote: boolean;
  values: ManualTradeFormValues;
  onFetchQuote: () => void;
  onUpdate: <K extends keyof ManualTradeFormValues>(
    field: K,
    value: ManualTradeFormValues[K]
  ) => void;
}

export function OptionalTradeFields({
  accounts,
  isFetchingQuote,
  values,
  onFetchQuote,
  onUpdate,
}: OptionalTradeFieldsProps) {
  return (
    <details className="group rounded-xl border border-card-border bg-muted-bg/30">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-muted-foreground">
        Optional trade details
        <span className="ml-2 text-xs font-medium text-muted group-open:hidden">
          price, date, fees, account
        </span>
      </summary>

      <div className="grid gap-4 border-t border-card-border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Price</span>
          <div className="flex gap-2">
            <input
              className={inputClass}
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={values.price}
              onChange={(event) => onUpdate('price', event.target.value)}
              placeholder="Auto"
            />
            <button
              type="button"
              onClick={onFetchQuote}
              disabled={isFetchingQuote || !values.symbol}
              className="shrink-0 rounded-xl border border-card-border px-3 text-xs font-bold text-accent transition hover:bg-accent/10 disabled:opacity-40"
            >
              {isFetchingQuote ? 'Getting…' : 'Live'}
            </button>
          </div>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Date</span>
          <input
            className={inputClass}
            type="date"
            value={values.date}
            onChange={(event) => onUpdate('date', event.target.value)}
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Time</span>
          <input
            className={inputClass}
            type="time"
            value={values.time}
            onChange={(event) => onUpdate('time', event.target.value)}
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Fees</span>
          <input
            className={inputClass}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={values.commission}
            onChange={(event) => onUpdate('commission', event.target.value)}
            placeholder="0"
          />
        </label>

        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Multiplier</span>
          <input
            className={inputClass}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={values.multiplier}
            onChange={(event) => onUpdate('multiplier', event.target.value)}
          />
        </label>

        {accounts.length > 0 && (
          <label className="space-y-2 sm:col-span-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Account</span>
            <select
              className={inputClass}
              value={values.accountId}
              onChange={(event) => onUpdate('accountId', event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.accountId} value={account.accountId}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </details>
  );
}

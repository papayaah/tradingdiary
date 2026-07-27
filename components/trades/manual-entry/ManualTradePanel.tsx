'use client';

import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { BasicTradeFields } from './BasicTradeFields';
import { OptionalTradeFields } from './OptionalTradeFields';
import { useManualTradeForm } from './useManualTradeForm';

interface ManualTradePanelProps {
  title?: string;
  onClose?: () => void;
  onSaved?: () => void | Promise<void>;
}

export function ManualTradePanel({
  title = 'Add a trade',
  onClose,
  onSaved,
}: ManualTradePanelProps) {
  const form = useManualTradeForm(onSaved);

  return (
    <section className="mx-auto w-full max-w-3xl rounded-2xl border border-accent/25 bg-card-bg p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted">
            Symbol and quantity are enough. We’ll use a live Yahoo price if price is blank.
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close manual trade form"
            className="rounded-lg p-2 text-muted transition hover:bg-muted-bg hover:text-foreground"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <div className="space-y-5">
        <BasicTradeFields
          values={form.values}
          onUpdate={form.update}
          onNormalizeSymbol={form.normalizeSymbol}
        />

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => form.update('direction', 'buy')}
            className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-bold transition ${
              form.values.direction === 'buy'
                ? 'border-profit/40 bg-profit/10 text-profit'
                : 'border-card-border text-muted hover:bg-muted-bg'
            }`}
          >
            <ArrowUp size={16} />
            Buy
          </button>
          <button
            type="button"
            onClick={() => form.update('direction', 'sell')}
            className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-bold transition ${
              form.values.direction === 'sell'
                ? 'border-loss/40 bg-loss/10 text-loss'
                : 'border-card-border text-muted hover:bg-muted-bg'
            }`}
          >
            <ArrowDown size={16} />
            Sell
          </button>
        </div>

        {form.values.symbol && (
          <p className="rounded-xl bg-accent/5 px-4 py-3 text-xs text-muted">
            {form.instrument.assetClass === 'future'
              ? `${form.instrument.symbol} · Futures · ${form.instrument.multiplier}× point value`
              : `${form.instrument.symbol} · Stock / ETF`}
            {' · '}{form.instrument.quoteProvider}
          </p>
        )}

        <OptionalTradeFields
          accounts={form.accounts}
          isFetchingQuote={form.isFetchingQuote}
          values={form.values}
          onFetchQuote={form.fetchQuote}
          onUpdate={form.update}
        />

        <button
          type="button"
          onClick={form.submit}
          disabled={form.isSaving}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-black text-white transition hover:bg-accent/90 disabled:cursor-wait disabled:opacity-60"
        >
          <Plus size={17} />
          {form.isSaving ? 'Adding trade…' : 'Add trade'}
        </button>
      </div>
    </section>
  );
}

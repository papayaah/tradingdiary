'use client';

import { useEffect, useMemo, useState } from 'react';
import { Target } from 'lucide-react';
import type { AggregatedTrade } from '@/lib/trading/aggregator';
import { computeTradeDetails } from '@/lib/trading/tradeDetails';
import { getCurrencySymbol } from '@/lib/currency';
import { getTradeNote, setTradePlan, type TradePlanPatch, type TradeRef } from '@/lib/db/notes';
import { plannedRMultiple, realizedRMultiple, type TradeSide } from '@/lib/trading/trade-plan';

interface TradePlanEditorProps {
  tradeRef: TradeRef;
  trade: AggregatedTrade;
  onChange?: () => void;
}

type PlanState = TradePlanPatch;

const num = (v: string): number | undefined => {
  const t = v.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

function RMultiple({ label, value }: { label: string; value: number | null }) {
  const tone =
    value == null ? 'text-muted' : value >= 0 ? 'text-profit' : 'text-loss';
  return (
    <div className="rounded-lg border border-card-border bg-muted-bg/30 px-3 py-2 text-center">
      <div className={`text-base font-bold tabular-nums ${tone}`}>
        {value == null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`}
      </div>
      <div className="text-[9px] font-bold uppercase tracking-wider text-muted mt-0.5">{label}</div>
    </div>
  );
}

export default function TradePlanEditor({ tradeRef, trade, onChange }: TradePlanEditorProps) {
  const [plan, setPlan] = useState<PlanState>({});
  const key = tradeRef.tradeGroupKey;

  const d = useMemo(() => computeTradeDetails(trade), [trade]);
  const side = d.side as TradeSide;
  const nativeSym = getCurrencySymbol(trade.currency || 'USD');

  useEffect(() => {
    let active = true;
    getTradeNote(key).then((note) => {
      if (!active || !note) return;
      setPlan({
        plannedEntry: note.plannedEntry,
        initialStop: note.initialStop,
        targets: note.targets,
        plannedRiskAmount: note.plannedRiskAmount,
        plannedRiskPercent: note.plannedRiskPercent,
        planTiming: note.planTiming,
        executionRating: note.executionRating,
        processRating: note.processRating,
      });
    });
    return () => {
      active = false;
    };
  }, [key]);

  const target0 = plan.targets?.[0];
  const plannedR = plannedRMultiple(side, plan.plannedEntry, plan.initialStop, target0);
  const realizedR = realizedRMultiple(side, d.avgEntry, d.avgExit ?? undefined, plan.initialStop);

  const save = (next: PlanState) => {
    setPlan(next);
    void setTradePlan(tradeRef, next).then(() => onChange?.());
  };

  const field = (patch: Partial<PlanState>) => ({ ...plan, ...patch });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-wider">
        <Target size={12} />
        Trade plan &amp; risk
        <span className="text-muted/70 normal-case font-normal tracking-normal">· {side.toLowerCase()}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <NumInput
          label={`Planned entry (${nativeSym})`}
          value={plan.plannedEntry}
          onCommit={(v) => save(field({ plannedEntry: v }))}
        />
        <NumInput
          label={`Initial stop (${nativeSym})`}
          value={plan.initialStop}
          onCommit={(v) => save(field({ initialStop: v }))}
        />
        <NumInput
          label={`Target (${nativeSym})`}
          value={target0}
          onCommit={(v) => save(field({ targets: v == null ? undefined : [v] }))}
        />
        <NumInput
          label={`Planned risk (${nativeSym})`}
          value={plan.plannedRiskAmount}
          onCommit={(v) => save(field({ plannedRiskAmount: v }))}
        />
        <NumInput
          label="Risk % of acct"
          value={plan.plannedRiskPercent}
          onCommit={(v) => save(field({ plannedRiskPercent: v }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 max-w-xs">
        <RMultiple label="Planned R" value={plannedR} />
        <RMultiple label="Realized R" value={realizedR} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented
          label="Plan made"
          options={[
            { value: 'before', label: 'Before' },
            { value: 'during', label: 'During' },
            { value: 'after', label: 'After' },
          ]}
          value={plan.planTiming}
          onSelect={(v) => save(field({ planTiming: v as PlanState['planTiming'] }))}
        />
        <Rating label="Execution" value={plan.executionRating} onSelect={(v) => save(field({ executionRating: v }))} />
        <Rating label="Process" value={plan.processRating} onSelect={(v) => save(field({ processRating: v }))} />
      </div>
    </div>
  );
}

function NumInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    setText(value == null ? '' : String(value));
  }, [value]);
  return (
    <label className="block">
      <span className="block text-[9px] font-bold uppercase tracking-wider text-muted mb-1">{label}</span>
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(num(text))}
        className="w-full bg-card-bg border border-card-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-foreground tabular-nums outline-none focus:border-accent"
      />
    </label>
  );
}

function Segmented({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string | undefined;
  onSelect: (v: string) => void;
}) {
  return (
    <div>
      <span className="block text-[9px] font-bold uppercase tracking-wider text-muted mb-1">{label}</span>
      <div className="inline-flex rounded-lg border border-card-border overflow-hidden">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onSelect(o.value)}
            className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              value === o.value ? 'bg-accent text-white' : 'bg-card-bg text-muted hover:text-foreground'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Rating({
  label,
  value,
  onSelect,
}: {
  label: string;
  value: number | undefined;
  onSelect: (v: number | undefined) => void;
}) {
  return (
    <div>
      <span className="block text-[9px] font-bold uppercase tracking-wider text-muted mb-1">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            title={`${n}/5`}
            onClick={() => onSelect(value === n ? undefined : n)}
            className={`w-6 h-6 rounded-md text-[11px] font-bold transition-colors ${
              value != null && n <= value
                ? 'bg-accent text-white'
                : 'bg-card-bg border border-card-border text-muted hover:text-foreground'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

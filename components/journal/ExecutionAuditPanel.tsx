'use client';

import { useEffect, useState } from 'react';
import { FileSearch } from 'lucide-react';
import type { TransactionRecord, ImportBatchRecord } from '@/lib/db/schema';
import { findImportSources } from '@/lib/db/import-batches';
import { getCurrencySymbol } from '@/lib/currency';

interface ExecutionAuditPanelProps {
  transactions: TransactionRecord[];
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[10px] font-normal text-muted uppercase tracking-wider shrink-0">{label}</span>
      <span className="text-[11px] font-normal text-foreground tabular-nums text-right break-all">{value}</span>
    </div>
  );
}

/**
 * Per-execution audit for a trade: the exact stored (normalized) values of each
 * fill, plus where it came from (import source/broker/date) resolved from the
 * import batch that created it. This is the traceability surface — "why does this
 * trade look like this?" — answered from deterministic data, no invented values.
 */
export default function ExecutionAuditPanel({ transactions }: ExecutionAuditPanelProps) {
  const [sources, setSources] = useState<Map<string, ImportBatchRecord>>(new Map());

  useEffect(() => {
    let active = true;
    findImportSources(transactions.map((t) => t.tradeId))
      .then((map) => {
        if (active) setSources(map);
      })
      .catch((err) => console.error('Failed to load execution provenance:', err));
    return () => {
      active = false;
    };
  }, [transactions]);

  const importedWhen = (ms: number) => new Date(ms).toLocaleDateString();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-wider">
        <FileSearch size={12} />
        Execution audit
        <span className="text-muted/70 normal-case font-normal tracking-normal">· stored values &amp; source</span>
      </div>

      <div className="space-y-2">
        {transactions.map((t) => {
          const sym = getCurrencySymbol(t.currency);
          const source = sources.get(t.tradeId);
          return (
            <div key={t.tradeId} className="rounded-lg border border-card-border bg-muted-bg/30 p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">{t.side}</span>
                <span className="text-[11px] text-muted tabular-nums">
                  {t.date} {t.time}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pt-1">
                <Field label="Quantity" value={t.quantity.toLocaleString()} />
                <Field label="Price" value={`${sym}${t.price}`} />
                <Field label="Total" value={`${sym}${t.totalValue}`} />
                <Field label="Commission" value={`${sym}${t.commission}`} />
                <Field label="Currency" value={t.currency} />
                {t.realizedPnL != null && <Field label="Realized P&L" value={t.realizedPnL} />}
                {t.fxRateToAccount != null && (
                  <Field
                    label="FX → Account"
                    value={`${t.fxRateToAccount} ${t.fxAccountCurrency ?? ''}${t.fxRateDate ? ` @ ${t.fxRateDate}` : ''}`}
                  />
                )}
                <Field label="Exec ID" value={t.tradeId} />
              </div>

              <div className="pt-1 border-t border-card-border/40 text-[10px] text-muted">
                {source ? (
                  <>
                    Source: <span className="text-foreground font-medium">{source.source}</span>
                    {source.brokerName && <> · {source.brokerName}</>} · imported {importedWhen(source.createdAt)}
                  </>
                ) : (
                  <>Source: not recorded (imported before history tracking, or entered manually)</>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileSearch } from 'lucide-react';
import type { TransactionRecord, ImportBatchRecord } from '@/lib/db/schema';
import { findImportSources } from '@/lib/db/import-batches';
import { getCurrencySymbol } from '@/lib/currency';
import { compareExecutionOrder } from '@/lib/trading/execution-order';

interface ExecutionAuditPanelProps {
  transactions: TransactionRecord[];
  highlightedExecutionId?: string | null;
  onExecutionHover?: (executionId: string | null) => void;
}

interface AuditRow {
  t: TransactionRecord;
  runningQty: number; // net position held after this fill (signed)
  avgCost: number; // running average cost of the open position (0 when flat)
}

/**
 * Replay the fills in execution order to derive the accumulated position after
 * each one: net quantity held and the running average cost of the open position.
 * Standard average-cost accounting — adding to a position blends the price;
 * reducing leaves the average untouched; crossing through zero re-bases it.
 */
function buildAuditRows(transactions: TransactionRecord[]): AuditRow[] {
  // Same canonical order as the splitter so the audit's running position matches
  // how the trade's side was derived (same-second fills tie-break on tradeId).
  const sorted = [...transactions].sort((a, b) =>
    compareExecutionOrder(a, b, a.tradeId, b.tradeId),
  );

  let netQty = 0;
  let avgCost = 0;
  const rows: AuditRow[] = [];

  for (const t of sorted) {
    const dir = t.side?.toUpperCase().startsWith('BUY') ? 1 : -1;
    const signedQty = dir * t.quantity;

    if (netQty === 0 || Math.sign(netQty) === Math.sign(signedQty)) {
      // Opening or adding to the position: blend the average cost.
      const combinedAbs = Math.abs(netQty) + Math.abs(signedQty);
      avgCost = combinedAbs > 0
        ? (avgCost * Math.abs(netQty) + t.price * Math.abs(signedQty)) / combinedAbs
        : 0;
      netQty += signedQty;
    } else {
      // Reducing, closing, or reversing the position.
      const newNet = netQty + signedQty;
      if (newNet === 0) {
        netQty = 0;
        avgCost = 0;
      } else if (Math.sign(newNet) === Math.sign(netQty)) {
        // Partial reduction: remaining position keeps its average cost.
        netQty = newNet;
      } else {
        // Reversed through flat: the leftover is a new position at this price.
        netQty = newNet;
        avgCost = t.price;
      }
    }

    rows.push({ t, runningQty: netQty, avgCost });
  }

  return rows;
}

/**
 * Per-execution audit for a trade, rendered as a table: every fill's stored
 * (normalized) values in execution order, the accumulated position after each,
 * and the import provenance. The traceability surface — "why does this trade
 * look like this?" — answered from deterministic data, no invented values.
 */
export default function ExecutionAuditPanel({
  transactions,
  highlightedExecutionId = null,
  onExecutionHover,
}: ExecutionAuditPanelProps) {
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

  const rows = useMemo(() => buildAuditRows(transactions), [transactions]);
  const importedWhen = (ms: number) => new Date(ms).toLocaleDateString();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-wider">
        <FileSearch size={12} />
        Execution audit
        <span className="text-muted/70 normal-case font-normal tracking-normal">
          · {rows.length} fill{rows.length === 1 ? '' : 's'} · accumulated position &amp; source
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-card-border">
        <table className="w-full min-w-[820px] text-[11px] tabular-nums border-collapse">
          <thead>
            <tr className="border-b border-card-border bg-muted-bg/40 text-muted">
              <th className="px-3 py-2 text-left font-medium uppercase tracking-wider">Time</th>
              <th className="px-3 py-2 text-left font-medium uppercase tracking-wider">Side</th>
              <th className="px-3 py-2 text-right font-medium uppercase tracking-wider">Qty</th>
              <th className="px-3 py-2 text-right font-medium uppercase tracking-wider">Price</th>
              <th className="px-3 py-2 text-right font-medium uppercase tracking-wider">Total</th>
              <th className="px-3 py-2 text-right font-medium uppercase tracking-wider">Comm.</th>
              <th className="px-3 py-2 text-right font-medium uppercase tracking-wider">Position</th>
              <th className="px-3 py-2 text-right font-medium uppercase tracking-wider">Avg Cost</th>
              <th className="px-3 py-2 text-left font-medium uppercase tracking-wider">Exec ID</th>
              <th className="px-3 py-2 text-left font-medium uppercase tracking-wider">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border/50">
            {rows.map(({ t, runningQty, avgCost }) => {
              const sym = getCurrencySymbol(t.currency);
              const source = sources.get(t.tradeId);
              const isBuy = t.side?.toUpperCase().startsWith('BUY');
              return (
                <tr
                  key={t.tradeId}
                  onMouseEnter={() => onExecutionHover?.(t.tradeId)}
                  onMouseLeave={() => onExecutionHover?.(null)}
                  className={`transition-colors ${
                    highlightedExecutionId === t.tradeId
                      ? 'bg-accent/10 ring-1 ring-inset ring-accent/30'
                      : 'hover:bg-muted-bg/30'
                  }`}
                >
                  <td className="px-3 py-2 whitespace-nowrap text-muted">{t.time}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`font-medium ${isBuy ? 'text-profit' : 'text-loss'}`}>{t.side}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">{t.quantity.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-foreground">{sym}{t.price}</td>
                  <td className="px-3 py-2 text-right text-foreground">{sym}{t.totalValue}</td>
                  <td className="px-3 py-2 text-right text-muted">{sym}{t.commission}</td>
                  <td className="px-3 py-2 text-right font-medium text-foreground">
                    {runningQty === 0 ? <span className="text-muted">flat</span> : runningQty.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground">
                    {avgCost > 0 ? `${sym}${avgCost.toFixed(4)}` : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted font-mono text-[10px]">{t.tradeId}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-[10px] text-muted">
                    {source ? (
                      <>
                        <span className="text-foreground font-medium">{source.source}</span>
                        {source.brokerName && <> · {source.brokerName}</>} · {importedWhen(source.createdAt)}
                      </>
                    ) : (
                      <span title="Imported before history tracking, or entered manually">not recorded</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

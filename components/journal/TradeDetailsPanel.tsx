'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { AggregatedTrade } from '@/lib/trading/aggregator';
import { computeTradeDetails, formatDuration } from '@/lib/trading/tradeDetails';
import { formatCurrency, getCurrencySymbol } from '@/lib/currency';
import { pnlColorClass } from '@/lib/utils/format';

interface TradeDetailsPanelProps {
  trade: AggregatedTrade;
  currency?: string;
  className?: string;
}

function Row({ label, value, valueClass }: { label: string; value: React.ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-[10px] font-normal text-muted uppercase tracking-wider shrink-0">{label}</span>
      <span className={`text-xs font-normal text-foreground tabular-nums text-right ${valueClass ?? ''}`}>{value}</span>
    </div>
  );
}

export default function TradeDetailsPanel({ trade, currency = 'USD', className = '' }: TradeDetailsPanelProps) {
  const [showMore, setShowMore] = useState(false);
  const d = computeTradeDetails(trade);
  // Prices and position cost are in the trade's NATIVE currency; the P&L amounts
  // are already converted to the account base currency. Label each with its own
  // currency rather than stamping native price numbers with the base symbol.
  const nativeCurrency = trade.currency || currency;
  const nativeSym = getCurrencySymbol(nativeCurrency);
  const price = (v: number) => `${nativeSym}${v.toFixed(2)}`;
  const points = (v: number) => `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(2)}`;
  const isLong = d.side === 'LONG';

  return (
    <div className={`p-4 ${className}`}>
      {/* Header: symbol, side, net P&L */}
      <div className="flex items-start justify-between gap-3 mb-3 pb-3 border-b border-card-border/50">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-normal text-foreground tracking-tight">{trade.symbol}</span>
            <span
              className={`px-1.5 py-0.5 text-[9px] font-normal uppercase tracking-wider rounded-md border ${
                isLong ? 'bg-profit/10 text-profit border-profit/20' : 'bg-loss/10 text-loss border-loss/20'
              }`}
            >
              {d.side}
            </span>
            {d.isOpen && (
              <span className="px-1.5 py-0.5 text-[9px] font-normal uppercase tracking-wider rounded-md bg-accent/10 text-accent border border-accent/20">
                Open
              </span>
            )}
          </div>
          <span className="text-[10px] font-normal text-muted">{d.dateLabel}</span>
        </div>
        <div className="text-right">
          <p className={`text-lg font-normal tabular-nums ${pnlColorClass(d.netPnL)}`}>
            {formatCurrency(d.netPnL, currency)}
          </p>
          <span className="text-[9px] font-normal text-muted uppercase tracking-wider">Net P&amp;L</span>
        </div>
      </div>

      {/* Essentials */}
      <div className="divide-y divide-card-border/30">
        <Row
          label={isLong ? 'Entry → Exit' : 'Entry → Cover'}
          value={
            <>
              {price(d.avgEntry)} <span className="text-muted">→</span>{' '}
              {d.avgExit != null ? price(d.avgExit) : <span className="text-muted">—</span>}
            </>
          }
        />
        <Row
          label="Time"
          value={
            <>
              {d.openTime ?? '—'} <span className="text-muted">→</span>{' '}
              {d.closeTime ?? <span className="text-muted">open</span>}
            </>
          }
        />
        {d.durationSeconds != null && <Row label="Duration" value={formatDuration(d.durationSeconds)} />}
        <Row
          label="Quantity"
          value={
            <>
              {d.totalQty.toLocaleString()}
              {d.isOpen && d.remainingQty > 0 && (
                <span className="text-muted font-medium"> · {d.remainingQty.toLocaleString()} held</span>
              )}
            </>
          }
        />
      </div>

      {/* More */}
      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="flex items-center gap-1 mt-2 text-[10px] font-bold text-muted hover:text-foreground uppercase tracking-wider transition-colors"
      >
        {showMore ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {showMore ? 'Less' : 'More'}
      </button>

      {showMore && (
        <div className="mt-2 pt-2 border-t border-card-border/30 divide-y divide-card-border/30 animate-in fade-in slide-in-from-top-1 duration-200">
          <Row label="P&L / Share" value={formatCurrency(d.pnlPerShare, currency)} valueClass={pnlColorClass(d.pnlPerShare)} />
          {d.pointsPerShare != null && (
            <Row
              label="Points / Share"
              value={points(d.pointsPerShare)}
              valueClass={d.pointsPerShare >= 0 ? 'text-profit' : 'text-loss'}
            />
          )}
          {d.pointsTotal != null && (
            <Row label="Points Total" value={points(d.pointsTotal)} valueClass={d.pointsTotal >= 0 ? 'text-profit' : 'text-loss'} />
          )}
          <Row label="Position Cost" value={formatCurrency(d.positionCost, nativeCurrency)} />
          <Row label="Gross P&L" value={formatCurrency(d.grossPnL, currency)} valueClass={pnlColorClass(d.grossPnL)} />
          <Row label="Commissions & Fees" value={formatCurrency(d.commissions, currency)} />
          <Row label="Executions" value={d.executions} />
        </div>
      )}
    </div>
  );
}

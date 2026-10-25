'use client';

import { useEffect, useMemo, useState } from 'react';
import TradeChart from './TradeChart';
import { loadTransactionsByIds } from '@/lib/trading/day-summaries-store';
import { formatCurrency } from '@/lib/currency';
import type { AggregatedTrade } from '@/lib/trading/aggregator';
import type { TransactionRecord } from '@/lib/db/schema';

function fmtTime(time: string): string {
  const [h, m] = time.split(':');
  const hour = Number(h);
  if (!Number.isFinite(hour)) return time;
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${(m ?? '00').padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function fmtDuration(mins?: number): string {
  if (!mins || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function sideLabel(side: TransactionRecord['side']): string {
  switch (side) {
    case 'BUYTOOPEN': return 'Buy · open';
    case 'SELLTOOPEN': return 'Sell · open';
    case 'BUYTOCLOSE': return 'Buy · close';
    case 'SELLTOCLOSE': return 'Sell · close';
    default: return side;
  }
}

interface PaperTradeDetailProps {
  trade: AggregatedTrade;
  currency: string;
  note: string;
  onSaveNote: (content: string) => void;
}

export default function PaperTradeDetail({ trade, currency, note, onSaveNote }: PaperTradeDetailProps) {
  const [txns, setTxns] = useState<TransactionRecord[] | null>(() => trade.transactions ?? null);
  const [tab, setTab] = useState<'review' | 'executions'>('review');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Hydrate raw fills from ids when the cached (compact) model omits them.
  useEffect(() => {
    if (txns !== null) return;
    const ids = trade.transactionIds ?? [];
    if (!ids.length) return;
    let active = true;
    loadTransactionsByIds(ids)
      .then((records) => {
        if (active) setTxns(records);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [trade.transactionIds, txns]);

  const fills = useMemo(() => {
    const list = txns ?? trade.transactions ?? [];
    return [...list].sort((a, b) => a.time.localeCompare(b.time));
  }, [txns, trade.transactions]);

  const entry = fills.length ? fills[0].price : null;
  const exit = fills.length ? fills[fills.length - 1].price : null;
  const timeRange = fills.length
    ? `${fmtTime(fills[0].time)}–${fmtTime(fills[fills.length - 1].time)}`
    : fmtTime(trade.firstTradeTime);
  const win = trade.netPnL >= 0;

  return (
    <div className="pb-5 pl-7">
      {/* Header stats */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[0.85rem] text-ink-soft">
        {entry != null && exit != null && (
          <span>
            Entry <span className="text-ink">{formatCurrency(entry, currency)}</span> → Exit{' '}
            <span className="text-ink">{formatCurrency(exit, currency)}</span>
          </span>
        )}
        <span>· {timeRange}</span>
        <span>· {fmtDuration(trade.holdMinutes)}</span>
        <span>· {trade.volume.toLocaleString()} vol</span>
        <span>· {trade.executions} fills</span>
      </div>

      {/* Tabs */}
      <div className="mt-3 flex items-center gap-5 border-b-2 border-line-soft pb-2 text-[0.95rem]">
        <button
          type="button"
          onClick={() => setTab('review')}
          className={tab === 'review' ? 'text-ink underline decoration-2 underline-offset-[6px]' : 'text-ink-soft hover:text-ink'}
        >
          Review
        </button>
        <button
          type="button"
          onClick={() => setTab('executions')}
          className={tab === 'executions' ? 'text-ink underline decoration-2 underline-offset-[6px]' : 'text-ink-soft hover:text-ink'}
        >
          Executions ({trade.executions})
        </button>
      </div>

      {tab === 'review' ? (
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 overflow-hidden rounded-[12px] border-[2.5px] border-line bg-paper-card">
            <TradeChart
              symbol={trade.symbol}
              date={trade.date}
              transactions={fills}
              highlightedExecutionId={highlightedId}
            />
          </div>
          <div>
            <div className="mb-1.5 text-[0.85rem] text-ink-soft">Trade reflection</div>
            <textarea
              defaultValue={note}
              onBlur={(event) => onSaveNote(event.target.value.trim())}
              placeholder="What was the setup, how did you execute, and what would you change?"
              className="min-h-[200px] w-full resize-y rounded-[12px] border-[2.5px] border-line bg-paper-card px-3.5 py-3 font-sans text-[0.9rem] leading-relaxed text-ink outline-none focus:ring-2 focus:ring-paper-profit/30"
            />
          </div>
        </div>
      ) : (
        <div className="mt-3 divide-y divide-line-soft">
          {fills.length === 0 && <div className="py-6 text-center text-[0.9rem] text-ink-soft">No execution detail available.</div>}
          {fills.map((fill) => (
            <div
              key={fill.tradeId}
              onMouseEnter={() => setHighlightedId(fill.tradeId)}
              onMouseLeave={() => setHighlightedId(null)}
              className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-paper-2"
            >
              <span className="w-[76px] shrink-0 text-[0.85rem] text-ink-soft">{fmtTime(fill.time)}</span>
              <span className="flex-1 text-[0.9rem] text-ink">{sideLabel(fill.side)}</span>
              <span className="shrink-0 font-sans text-[0.9rem] tabular-nums text-ink">
                {fill.quantity.toLocaleString()} @ {formatCurrency(fill.price, currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Net P&L echo under the detail for quick reference */}
      <div className="mt-3 text-[0.85rem] text-ink-soft">
        Net P&amp;L{' '}
        <span className={`font-hand text-[1.05rem] tabular-nums ${win ? 'text-paper-profit' : 'text-paper-loss'}`}>
          {formatCurrency(trade.netPnL, currency)}
        </span>
      </div>
    </div>
  );
}

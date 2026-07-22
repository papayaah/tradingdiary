'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { AggregatedTrade } from '@/lib/trading/aggregator';
import { pnlColorClass, formatVolume } from '@/lib/utils/format';
import { formatCurrency } from '@/lib/currency';
import {
  getTradeNote,
  addScreenshotToTrade,
  removeScreenshotFromTrade,
} from '@/lib/db/notes';
import TradeChart from './TradeChart';
import ScreenshotAttachment from './ScreenshotAttachment';

interface TradeTableProps {
  trades: AggregatedTrade[];
  accountId: string;
  currency?: string;
}

export default function TradeTable({ trades, accountId, currency = 'USD' }: TradeTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (key: string) => {
    setExpanded((prev) => (prev === key ? null : key));
  };

  return (
    <div className="bg-card-bg/20 rounded-b-2xl overflow-hidden">
      <div className="overflow-x-auto overflow-y-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted-bg/50 text-muted border-b border-card-border/50">
              <th className="w-10 px-3 py-4" />
              <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest">Time</th>
              <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest">Symbol</th>
              <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest">Side</th>
              <th className="text-right px-5 py-4 text-[10px] font-bold uppercase tracking-widest">Volume</th>
              <th className="text-right px-5 py-4 text-[10px] font-bold uppercase tracking-widest">Execs</th>
              <th className="text-right px-5 py-4 text-[10px] font-bold uppercase tracking-widest">P&L</th>
              <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest">Notes</th>
              <th className="text-left px-5 py-4 text-[10px] font-bold uppercase tracking-widest">Tags</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => {
              const key = `${trade.date}-${trade.symbol}`;
              const isExpanded = expanded === key;

              return (
                <TradeRow
                  key={key}
                  trade={trade}
                  rowKey={key}
                  isExpanded={isExpanded}
                  onToggle={toggle}
                  accountId={accountId}
                  currency={currency}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TradeRow({
  trade,
  rowKey,
  isExpanded,
  onToggle,
  accountId,
  currency,
}: {
  trade: AggregatedTrade;
  rowKey: string;
  isExpanded: boolean;
  onToggle: (key: string) => void;
  accountId: string;
  currency: string;
}) {
  const [screenshotIds, setScreenshotIds] = useState<number[]>([]);

  useEffect(() => {
    if (!isExpanded) return;
    getTradeNote(trade.date, trade.symbol, accountId).then((note) => {
      setScreenshotIds(note?.screenshotIds ?? []);
    });
  }, [isExpanded, trade.date, trade.symbol, accountId]);

  const handleAddScreenshot = useCallback(
    async (assetId: number) => {
      await addScreenshotToTrade(trade.date, trade.symbol, accountId, assetId);
      setScreenshotIds((prev) => [...prev, assetId]);
    },
    [trade.date, trade.symbol, accountId]
  );

  const handleRemoveScreenshot = useCallback(
    async (assetId: number) => {
      await removeScreenshotFromTrade(trade.date, trade.symbol, accountId, assetId);
      setScreenshotIds((prev) => prev.filter((id) => id !== assetId));
    },
    [trade.date, trade.symbol, accountId]
  );

  return (
    <>
      <tr
        className={`group border-b border-card-border/30 hover:bg-muted-bg/40 transition-all cursor-pointer ${isExpanded ? 'bg-muted-bg/30' : ''}`}
        onClick={() => onToggle(rowKey)}
      >
        <td className="px-3 py-4 text-center">
          <div className={`p-1 rounded-lg transition-colors ${isExpanded ? 'text-accent bg-accent/10' : 'text-muted group-hover:text-foreground'}`}>
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
        </td>
        <td className="px-5 py-4 text-muted font-mono text-[11px] font-medium tracking-tight">
          {trade.firstTradeTime.substring(0, 8)}
        </td>
        <td className="px-5 py-4 font-black text-foreground text-sm tracking-tight capitalize">
          {trade.symbol}
        </td>
        <td className="px-5 py-4">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${trade.side === 'LONG'
              ? 'bg-profit/10 text-profit border border-profit/20'
              : 'bg-loss/10 text-loss border border-loss/20'
              }`}
          >
            {trade.side}
          </span>
        </td>
        <td className="px-5 py-4 text-right font-medium text-foreground tabular-nums">
          {formatVolume(trade.volume)}
        </td>
        <td className="px-5 py-4 text-right text-muted tabular-nums">
          {trade.executions}
        </td>
        <td className="px-5 py-4 text-right shrink-0">
          <span className={`text-sm font-black tabular-nums ${pnlColorClass(trade.netPnL)} drop-shadow-sm`}>
            {formatCurrency(trade.netPnL, currency)}
          </span>
          {trade.isOpen && (
            <div className="flex flex-col items-end gap-0.5 mt-1">
              <span className="text-[9px] font-bold text-muted/60 uppercase tracking-tighter">
                {formatVolume(Math.abs(trade.netQuantity))} held
              </span>
              {trade.unrealizedPnL != null && (
                <span className={`text-[10px] font-bold px-1 rounded bg-muted-bg/50 ${pnlColorClass(trade.unrealizedPnL)}`}>
                  unrl: {formatCurrency(trade.unrealizedPnL, currency)}
                </span>
              )}
            </div>
          )}
        </td>
        <td className="px-5 py-4 text-muted/40 font-medium italic text-xs">No notes</td>
        <td className="px-5 py-4 text-muted/40 font-medium italic text-xs">-</td>
      </tr>
      {isExpanded && (
        <>
          <tr>
            <td colSpan={9} className="p-0">
              <TradeChart
                symbol={trade.symbol}
                date={trade.date}
                transactions={trade.transactions}
              />
            </td>
          </tr>
          <tr>
            <td colSpan={9} className="px-5 py-3 border-t border-card-border">
              <div className="text-xs text-muted mb-1.5 font-medium uppercase tracking-wider">Screenshots</div>
              <ScreenshotAttachment
                screenshotIds={screenshotIds}
                onAdd={handleAddScreenshot}
                onRemove={handleRemoveScreenshot}
              />
            </td>
          </tr>
        </>
      )}
    </>
  );
}

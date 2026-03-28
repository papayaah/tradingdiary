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
    <div className="bg-card-bg rounded-b-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-table-header-bg text-muted text-[10px] uppercase font-bold tracking-tight">
              <th className="w-8 px-2 py-2" />
              <th className="text-left px-5 py-2 font-bold">Time</th>
              <th className="text-left px-5 py-2 font-bold">Symbol</th>
              <th className="text-left px-5 py-2 font-bold">Side</th>
              <th className="text-right px-5 py-2 font-bold">Volume</th>
              <th className="text-right px-5 py-2 font-bold">Execs</th>
              <th className="text-right px-5 py-2 font-bold">P&L</th>
              <th className="text-left px-5 py-2 font-bold">Notes</th>
              <th className="text-left px-5 py-2 font-bold">Tags</th>
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
        className="border-t border-card-border hover:bg-table-row-hover transition-colors cursor-pointer"
        onClick={() => onToggle(rowKey)}
      >
        <td className="px-2 py-3 text-center text-muted">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </td>
        <td className="px-5 py-3 text-foreground">
          {trade.firstTradeTime.substring(0, 8)}
        </td>
        <td className="px-5 py-3 font-medium text-foreground">
          {trade.symbol}
        </td>
        <td className="px-5 py-3">
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${trade.side === 'LONG'
              ? 'bg-profit/15 text-profit'
              : 'bg-loss/15 text-loss'
              }`}
          >
            {trade.side}
          </span>
        </td>
        <td className="px-5 py-3 text-right text-foreground">
          {formatVolume(trade.volume)}
        </td>
        <td className="px-5 py-3 text-right text-foreground">
          {trade.executions}
        </td>
        <td className="px-5 py-3 text-right">
          <span className={`font-medium ${pnlColorClass(trade.netPnL)}`}>
            {formatCurrency(trade.netPnL, currency)}
          </span>
          {trade.isOpen && (
            <div className="text-[10px] text-muted italic mt-0.5">
              {formatVolume(Math.abs(trade.netQuantity))} held
              {trade.unrealizedPnL != null && (
                <span className={`ml-1 ${pnlColorClass(trade.unrealizedPnL)}`}>
                  (unrl: {formatCurrency(trade.unrealizedPnL, currency)})
                </span>
              )}
            </div>
          )}
        </td>
        <td className="px-5 py-3 text-muted">-</td>
        <td className="px-5 py-3 text-muted">-</td>
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

'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { AggregatedTrade } from '@/lib/trading/aggregator';
import { pnlColorClass, formatVolume } from '@/lib/utils/format';
import TradeChart from './TradeChart';

interface TradeTableProps {
  trades: AggregatedTrade[];
}

export default function TradeTable({ trades }: TradeTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (key: string) => {
    setExpanded((prev) => (prev === key ? null : key));
  };

  return (
    <div className="bg-card-bg rounded-b-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-table-header-bg text-muted text-xs uppercase tracking-wider">
              <th className="w-8 px-2 py-2.5" />
              <th className="text-left px-5 py-2.5 font-medium">Time</th>
              <th className="text-left px-5 py-2.5 font-medium">Symbol</th>
              <th className="text-left px-5 py-2.5 font-medium">Side</th>
              <th className="text-right px-5 py-2.5 font-medium">Volume</th>
              <th className="text-right px-5 py-2.5 font-medium">Execs</th>
              <th className="text-right px-5 py-2.5 font-medium">P&L</th>
              <th className="text-left px-5 py-2.5 font-medium">Notes</th>
              <th className="text-left px-5 py-2.5 font-medium">Tags</th>
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
}: {
  trade: AggregatedTrade;
  rowKey: string;
  isExpanded: boolean;
  onToggle: (key: string) => void;
}) {
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
          {trade.isOpen ? (
            <span className="text-muted italic">open</span>
          ) : (
            trade.firstTradeTime.substring(0, 8)
          )}
        </td>
        <td className="px-5 py-3 font-medium text-foreground">
          {trade.symbol}
        </td>
        <td className="px-5 py-3">
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
              trade.side === 'LONG'
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
          {trade.isOpen ? (
            <span className="text-xs text-muted italic">
              {formatVolume(Math.abs(trade.netQuantity))} shares held
            </span>
          ) : (
            <span className={`font-medium ${pnlColorClass(trade.netPnL)}`}>
              {trade.netPnL < 0 ? '-' : ''}$
              {Math.abs(trade.netPnL).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          )}
        </td>
        <td className="px-5 py-3 text-muted">-</td>
        <td className="px-5 py-3 text-muted">-</td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={9} className="p-0">
            <TradeChart
              symbol={trade.symbol}
              date={trade.date}
              transactions={trade.transactions}
            />
          </td>
        </tr>
      )}
    </>
  );
}

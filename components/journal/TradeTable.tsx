'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { AggregatedTrade } from '@/lib/trading/aggregator';
import { pnlColorClass, formatVolume } from '@/lib/utils/format';
import { formatExchangeTime } from '@/lib/trading/exchange-time';
import { formatCurrency } from '@/lib/currency';
import { getTradePnlDisplay } from '@/lib/trading/pnl-display';
import {
  getTradeNote,
  addScreenshotToTrade,
  removeScreenshotFromTrade,
  tradeRef,
} from '@/lib/db/notes';
import TradeChart from './TradeChart';
import TradeDetailsPanel from './TradeDetailsPanel';
import ScreenshotAttachment from './ScreenshotAttachment';
import TradeNotesEditor from './TradeNotesEditor';
import TradeAIReviewCard from './TradeAIReviewCard';

interface TradeTableProps {
  trades: AggregatedTrade[];
  accountId: string;
  currency?: string;
  focusSymbol?: string;
  showBaseCurrency?: boolean;
}

export default function TradeTable({ trades, accountId, currency = 'USD', focusSymbol, showBaseCurrency = false }: TradeTableProps) {
  const focusedTrade = focusSymbol
    ? trades.find((item) => item.symbol.toUpperCase() === focusSymbol.toUpperCase())
    : undefined;
  const [expanded, setExpanded] = useState<string | null>(
    focusedTrade ? `${focusedTrade.date}-${focusedTrade.symbol}` : null
  );

  const toggle = (key: string) => {
    setExpanded((prev) => (prev === key ? null : key));
  };

  return (
    <div className="bg-card-bg/20 rounded-b-2xl overflow-hidden">
      <div className="overflow-x-auto overflow-y-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted-bg/50 text-muted border-b border-card-border/50">
              <th className="w-8 px-2 py-3" />
              <th className="text-left px-2.5 sm:px-4 py-3 text-[10px] font-normal uppercase tracking-wider">Time</th>
              <th className="text-left px-2.5 sm:px-4 py-3 text-[10px] font-normal uppercase tracking-wider">Symbol</th>
              <th className="text-left px-2.5 sm:px-4 py-3 text-[10px] font-normal uppercase tracking-wider">Side</th>
              <th className="hidden sm:table-cell text-right px-4 py-3 text-[10px] font-normal uppercase tracking-wider">Volume</th>
              <th className="hidden md:table-cell text-right px-2.5 sm:px-4 py-3 text-[10px] font-normal uppercase tracking-wider">Execs</th>
              <th className="text-right px-2.5 sm:px-4 py-3 text-[10px] font-normal uppercase tracking-wider">P&amp;L</th>
              <th className="hidden lg:table-cell text-left px-2.5 sm:px-4 py-3 text-[10px] font-normal uppercase tracking-wider">Notes</th>
              <th className="hidden xl:table-cell text-left px-2.5 sm:px-4 py-3 text-[10px] font-normal uppercase tracking-wider">Tags</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, idx) => {
              // Flat-to-flat rows share date+symbol, so key by the unique trade
              // group; fall back to a positional key for legacy aggregation.
              const key = trade.groupKey ?? `${trade.date}-${trade.symbol}-${idx}`;
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
                  isFocused={Boolean(focusSymbol && trade.symbol.toUpperCase() === focusSymbol.toUpperCase())}
                  showBaseCurrency={showBaseCurrency}
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
  isFocused,
  showBaseCurrency,
}: {
  trade: AggregatedTrade;
  rowKey: string;
  isExpanded: boolean;
  onToggle: (key: string) => void;
  accountId: string;
  currency: string;
  isFocused: boolean;
  showBaseCurrency: boolean;
}) {
  const [screenshotIds, setScreenshotIds] = useState<number[]>([]);
  const rowRef = useRef<HTMLTableRowElement>(null);
  const ref = tradeRef(trade, accountId);
  const groupKey = ref.tradeGroupKey;

  useEffect(() => {
    if (!isFocused) return;
    const frame = requestAnimationFrame(() => {
      rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [isFocused]);

  useEffect(() => {
    if (!isExpanded) return;
    getTradeNote(groupKey).then((note) => {
      setScreenshotIds(note?.screenshotIds ?? []);
    });
  }, [isExpanded, groupKey]);

  const handleAddScreenshot = useCallback(
    async (assetId: number) => {
      await addScreenshotToTrade(ref, assetId);
      setScreenshotIds((prev) => [...prev, assetId]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupKey]
  );

  const handleRemoveScreenshot = useCallback(
    async (assetId: number) => {
      await removeScreenshotFromTrade(groupKey, assetId);
      setScreenshotIds((prev) => prev.filter((id) => id !== assetId));
    },
    [groupKey]
  );

  const tradeCurrency = trade.currency || currency;
  const pnlDisplay = getTradePnlDisplay(trade, currency, showBaseCurrency);
  const isDifferentCurrency = pnlDisplay.isConverted;

  return (
    <>
      <tr
        ref={rowRef}
        className={`group border-b hover:bg-muted-bg/40 transition-all cursor-pointer ${isFocused ? 'border-accent bg-accent/10 ring-1 ring-inset ring-accent/30' : 'border-card-border/30'} ${isExpanded ? 'bg-muted-bg/30' : ''}`}
        onClick={() => onToggle(rowKey)}
      >
        <td className="px-2 py-3 text-center w-8">
          <div className={`p-1 rounded-lg transition-colors ${isExpanded ? 'text-accent bg-accent/10' : 'text-muted group-hover:text-foreground'}`}>
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
        </td>
        <td className="px-2.5 sm:px-4 py-3 text-muted font-mono text-[11px] font-normal tracking-tight whitespace-nowrap">
          {formatExchangeTime(trade.firstTradeTime, trade.date)}
        </td>
        <td className="px-2.5 sm:px-4 py-3 font-normal text-foreground text-xs sm:text-sm tracking-tight capitalize whitespace-nowrap">
          {trade.symbol}
        </td>
        <td className="px-2.5 sm:px-4 py-3 whitespace-nowrap">
          <span
            className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-lg text-[9px] sm:text-[10px] font-normal uppercase tracking-wider ${trade.side === 'LONG'
              ? 'bg-profit/10 text-profit border border-profit/20'
              : 'bg-loss/10 text-loss border border-loss/20'
              }`}
          >
            {trade.side}
          </span>
        </td>
        <td className="hidden sm:table-cell px-4 py-3 text-right font-normal text-foreground tabular-nums whitespace-nowrap text-sm">
          {formatVolume(trade.volume)}
        </td>
        <td className="hidden md:table-cell px-2.5 sm:px-4 py-3 text-right text-muted tabular-nums text-xs whitespace-nowrap">
          {trade.executions}
        </td>
        <td className="px-2.5 sm:px-4 py-3 text-right shrink-0 whitespace-nowrap">
          <span className={`text-xs sm:text-sm font-normal tabular-nums ${pnlColorClass(pnlDisplay.primaryAmount)}`}>
            {formatCurrency(pnlDisplay.primaryAmount, pnlDisplay.primaryCurrency)}
          </span>
          {isDifferentCurrency && (
            <div className="mt-0.5 text-[9px] text-muted tabular-nums">
              {formatCurrency(pnlDisplay.secondaryAmount ?? 0, pnlDisplay.secondaryCurrency)}
            </div>
          )}
          {trade.isOpen && (
            <div className="flex flex-col items-end gap-0.5 mt-0.5">
              <span className="text-[9px] font-normal text-muted/60 uppercase tracking-tighter">
                {formatVolume(Math.abs(trade.netQuantity))} held
              </span>
              {trade.unrealizedPnL != null && (
                <span className={`text-[10px] font-normal px-1 rounded bg-muted-bg/50 ${pnlColorClass(trade.unrealizedPnL)}`}>
                  unrl: {formatCurrency(
                    isDifferentCurrency && !showBaseCurrency
                      ? (trade.nativeUnrealizedPnL ?? trade.unrealizedPnL)
                      : trade.unrealizedPnL,
                    isDifferentCurrency && !showBaseCurrency ? tradeCurrency : currency,
                  )}
                </span>
              )}
            </div>
          )}
        </td>
        <td className="hidden lg:table-cell px-2.5 sm:px-4 py-3 text-muted/40 font-normal italic text-xs truncate max-w-[120px]">No notes</td>
        <td className="hidden xl:table-cell px-2.5 sm:px-4 py-3 text-muted/40 font-normal italic text-xs">-</td>
      </tr>
      {isExpanded && (
        <>
          <tr>
            <td colSpan={9} className="p-0">
              <div className="flex flex-col lg:flex-row border-t border-card-border/50 bg-card-bg/30">
                <TradeDetailsPanel
                  trade={trade}
                  currency={currency}
                  className="lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-card-border/50"
                />
                <div className="flex-1 min-w-0">
                  <TradeChart
                    symbol={trade.symbol}
                    date={trade.date}
                    transactions={trade.transactions}
                  />
                </div>
              </div>
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
          <tr>
            <td colSpan={9} className="px-5 py-4 border-t border-card-border">
              <TradeNotesEditor tradeRef={ref} />
            </td>
          </tr>
          <tr>
            <td colSpan={9} className="px-5 py-4 border-t border-card-border">
              <TradeAIReviewCard trade={trade} accountId={accountId} currency={currency} />
            </td>
          </tr>
        </>
      )}
    </>
  );
}

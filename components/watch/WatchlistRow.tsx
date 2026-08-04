'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  Clock,
  RefreshCw,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { Candle } from './watchAnalysis';
import { detectAllPatterns, CandleData } from '@/lib/chart/patterns';
import { displaySymbol, shortProviderLabel } from '@/lib/utils/format';
import { calculateWatchPriceChange } from '@/lib/market/intraday-change';

interface WatchlistRowItem {
  symbol: string;
  interval: string;
  lastChecked?: string;
  status?: 'bullish' | 'bearish' | 'none' | 'no-data' | 'error';
  lastError?: string;
  provider?: string;
  candles?: Candle[];
  intradayChange?: number | null;
  intradayChangePercent?: number | null;
}

interface WatchlistRowProps {
  item: WatchlistRowItem;
  index: number;
  miniCandles: Candle[];
  onToggle: (index: number) => void;
  onRemove: (symbol: string, interval: string) => void;
  onRefresh: (symbol: string, interval: string) => Promise<void> | void;
}

function WatchlistRow({
  item,
  index,
  miniCandles,
  onToggle,
  onRemove,
  onRefresh,
}: WatchlistRowProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const latestPrice = miniCandles.at(-1)?.close;
  const priceChange = React.useMemo(() => {
    // Prefer the server-computed change: it uses the correct baseline (equity
    // prior RTH close, futures prior settlement). Fall back to a client window
    // calc only when the server value is absent (e.g. a signed-out session).
    if (item.intradayChangePercent != null && Number.isFinite(item.intradayChangePercent)) {
      return { amount: item.intradayChange ?? 0, percent: item.intradayChangePercent };
    }
    const sourceCandles = item.candles?.length ? item.candles : miniCandles;
    return calculateWatchPriceChange(item.symbol, item.interval, sourceCandles);
  }, [item.intradayChange, item.intradayChangePercent, item.candles, item.interval, item.symbol, miniCandles]);
  const changeClass = (priceChange?.amount ?? 0) > 0
    ? 'text-profit'
    : (priceChange?.amount ?? 0) < 0
      ? 'text-loss'
      : 'text-muted';

  const detectedPattern = React.useMemo(() => {
    if (!miniCandles || miniCandles.length < 10) return null;
    const res = detectAllPatterns(miniCandles as CandleData[]);
    return res.patterns[0];
  }, [miniCandles]);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh(item.symbol, item.interval);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <tr
      id={`row-${item.symbol.toUpperCase()}-${item.interval}`}
      className={`group transition-colors ${
        item.status === 'bullish'
          ? 'bg-emerald-500/10 dark:bg-emerald-500/5 hover:bg-emerald-500/15 dark:hover:bg-emerald-500/10'
          : item.status === 'bearish'
            ? 'bg-rose-500/10 dark:bg-rose-500/5 hover:bg-rose-500/15 dark:hover:bg-rose-500/10'
            : 'hover:bg-table-row-hover'
      }`}
    >
      <td
        onClick={() => onToggle(index)}
        className="py-4 px-4 font-bold text-foreground cursor-pointer hover:text-accent transition-colors"
        title="Click to expand inline session chart"
      >
        {displaySymbol(item.symbol)}
        {item.provider && (
          <span
            className="ml-2 rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent align-middle"
            title={`Data source: ${item.provider}`}
          >
            {shortProviderLabel(item.provider)}
          </span>
        )}
        {latestPrice !== undefined && (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] font-normal text-muted">
            <span>Last Price: ${latestPrice.toFixed(2)}</span>
            {priceChange ? (
              <span
                className={`font-bold ${changeClass}`}
                title="Price change over the same session window used by alerts"
              >
                ({priceChange.amount < 0 ? '-' : '+'}${Math.abs(priceChange.amount).toFixed(2)} /{' '}
                {priceChange.percent > 0 ? '+' : ''}{priceChange.percent.toFixed(2)}%)
              </span>
            ) : null}
          </span>
        )}
      </td>
      <td
        onClick={() => onToggle(index)}
        className="py-4 px-4 cursor-pointer hover:opacity-80 transition-opacity"
        title="Click to expand inline session chart"
      >
        {miniCandles.length > 0 ? (
          <div className="flex items-center justify-center gap-1 h-6">
            {miniCandles.map((candle) => (
              <div
                key={candle.time}
                className={`w-3.5 h-full rounded-[2px] transition-all ${
                  candle.close >= candle.open
                    ? 'bg-emerald-500/80 hover:bg-emerald-400'
                    : 'bg-rose-500/80 hover:bg-rose-400'
                }`}
                title={`O: ${candle.open} | C: ${candle.close}`}
              />
            ))}
          </div>
        ) : (
          <span className="block text-center text-muted text-xs font-normal">—</span>
        )}
      </td>
      <td className="py-4 px-4 text-xs text-muted">{item.lastChecked || 'Never'}</td>
      <td className="py-4 px-4">
        {item.status === 'bullish' && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse">
            <TrendingUp size={12} /> Bullish Alert
          </span>
        )}
        {item.status === 'bearish' && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse">
            <TrendingDown size={12} /> Bearish Alert
          </span>
        )}
        {item.status === 'none' && (
          detectedPattern ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Sparkles size={12} className="animate-pulse text-amber-400" />
              <span>{detectedPattern.name}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted-bg text-muted border border-card-border">
              Normal
            </span>
          )
        )}
        {item.status === 'no-data' && (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20"
            title={item.lastError}
          >
            <Clock size={12} /> No current data
          </span>
        )}
        {item.status === 'error' && (
          <div className="flex flex-col items-start gap-1">
            <span
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 cursor-pointer"
              title={item.lastError}
            >
              <AlertTriangle size={12} /> Error
            </span>
            {item.lastError && (
              <span
                className="text-[10px] text-amber-500/80 font-medium block max-w-[150px] truncate leading-normal"
                title={item.lastError}
              >
                {item.lastError}
              </span>
            )}
          </div>
        )}
        {!item.status && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted-bg text-muted/60">
            Pending
          </span>
        )}
      </td>
      <td className="py-4 px-4 text-right">
        <div className="inline-flex items-center gap-1">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg text-muted hover:bg-muted-bg hover:text-accent transition-all disabled:opacity-60"
            title="Refresh this ticker now"
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => onRemove(item.symbol, item.interval)}
            className="p-1.5 rounded-lg text-muted hover:bg-muted-bg hover:text-rose-500 transition-all"
            title="Remove ticker"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default React.memo(WatchlistRow);

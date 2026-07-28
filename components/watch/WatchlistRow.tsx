'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  Clock,
  Edit,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { Candle } from './watchAnalysis';

interface WatchlistRowItem {
  symbol: string;
  interval: string;
  minMovePercent: number;
  lastChecked?: string;
  status?: 'bullish' | 'bearish' | 'none' | 'no-data' | 'error';
  lastError?: string;
}

interface WatchlistRowProps {
  item: WatchlistRowItem;
  index: number;
  miniCandles: Candle[];
  onToggle: (index: number) => void;
  onSaveMinMove: (index: number, value: number) => void;
  onRemove: (symbol: string, interval: string) => void;
  onRefresh: (symbol: string, interval: string) => Promise<void> | void;
}

function WatchlistRow({
  item,
  index,
  miniCandles,
  onToggle,
  onSaveMinMove,
  onRemove,
  onRefresh,
}: WatchlistRowProps) {
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const latestPrice = miniCandles.at(-1)?.close;

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh(item.symbol, item.interval);
    } finally {
      setIsRefreshing(false);
    }
  };

  const saveMinMove = () => {
    if (editingValue === null) return;
    const value = Number(editingValue);
    setEditingValue(null);
    if (Number.isFinite(value) && value >= 0) {
      onSaveMinMove(index, value);
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
        {item.symbol}
        {latestPrice !== undefined && (
          <span className="block text-[10px] font-normal text-muted mt-0.5">
            Last Price: ${latestPrice.toFixed(2)}
          </span>
        )}
      </td>
      <td
        onClick={() => onToggle(index)}
        className="py-4 px-4 text-xs font-mono text-muted cursor-pointer hover:text-accent transition-colors"
        title="Click to expand inline session chart"
      >
        {item.interval}
      </td>
      <td className="py-4 px-4 text-xs text-muted">
        {editingValue !== null ? (
          <div className="relative z-20 flex flex-col gap-2 bg-card-bg border border-card-border shadow-xl rounded-xl p-3 min-w-[200px] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between text-[11px] font-semibold text-muted">
              <span>Min Move Threshold</span>
              <span className="font-mono text-accent font-bold">{editingValue}%</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="3.00"
              step="0.05"
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              className="w-full h-2 bg-muted-bg rounded-lg appearance-none cursor-pointer accent-accent"
            />
            <div className="flex items-center gap-1 justify-between mt-1">
              {[0.10, 0.25, 0.50, 1.00].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setEditingValue(String(preset));
                    onSaveMinMove(index, preset);
                    setEditingValue(null);
                  }}
                  className="px-1.5 py-0.5 rounded bg-muted-bg hover:bg-accent hover:text-white text-[10px] font-mono text-muted transition-colors"
                >
                  {preset}%
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <button
                type="button"
                onClick={saveMinMove}
                className="flex-1 bg-accent text-white py-1 rounded text-xs font-semibold hover:bg-accent/80 transition-colors"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingValue(null)}
                className="px-2 bg-muted-bg text-muted py-1 rounded text-xs hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => setEditingValue(String(item.minMovePercent))}
            className="cursor-pointer hover:bg-muted-bg/50 px-2 py-1 -mx-2 rounded border border-transparent hover:border-card-border/40 text-xs text-foreground font-semibold inline-flex items-center gap-1.5 transition-all"
            title="Click to edit threshold slider"
          >
            <span>{item.minMovePercent}%</span>
            <Edit size={10} className="text-muted/40 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
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
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted-bg text-muted border border-card-border">
            Normal
          </span>
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

'use client';

import React from 'react';
import { Sparkles, Plus } from 'lucide-react';
import { WatchlistViewToggle, type WatchlistView } from './WatchControls';
import WatchlistRow from './WatchlistRow';
import CompactWatchlist, { type CompactWatchlistEntry } from './CompactWatchlist';
import type { Candle, PatternId } from './watchAnalysis';

export interface WatchItem {
  symbol: string;
  interval: string;
  provider?: string;
  lastChecked?: string;
  status?: 'bullish' | 'bearish' | 'none' | 'no-data' | 'error';
  lastPrice?: number;
  lastError?: string;
  candles?: Candle[];
  selectedPatternIds?: PatternId[];
  matchedPatternIds?: PatternId[];
  lastAlertedCandleTime?: number;
  lastAlertedType?: 'bullish' | 'bearish';
  lastAlertedPatternId?: PatternId;
  lastAlertedPatternKeys?: Partial<Record<PatternId, string>>;
}

export interface WatchlistSectionProps {
  watchlist: WatchItem[];
  sortedWatchlist: WatchItem[];
  watchlistCategory: 'all' | 'stocks' | 'crypto' | 'futures';
  onCategoryChange: (cat: 'all' | 'stocks' | 'crypto' | 'futures') => void;
  newTicker: string;
  onTickerChange: (val: string) => void;
  newInterval: string;
  onIntervalChange: (val: string) => void;
  onAddSymbol: (e: React.FormEvent) => void;
  onRemoveSymbol: (symbol: string, interval: string) => void;
  onQuickPresetAdd: (symbol: string) => void;
  watchlistView: WatchlistView;
  onViewChange: (view: WatchlistView) => void;
  filterMode: 'all' | 'alerts' | 'errors';
  onFilterModeChange: (mode: 'all' | 'alerts' | 'errors') => void;
  autoPatternsEnabled: boolean;
  onToggleAutoPatterns: () => void;
  expandedRowIndex: number | null;
  onToggleRowExpansion: (index: number) => void;
  onRefreshItem: (symbol: string, interval: string) => Promise<void> | void;
  getMiniCandles: (item: WatchItem) => Candle[];
  compactEntries: CompactWatchlistEntry[];
  testResult: { success: boolean } | null;
  renderJustChartCanvas: () => React.ReactNode;
  categoryCounts: { all: number; stocks: number; crypto: number; futures: number };
  quickPresets: readonly { label: string; symbol: string }[];
}

export function WatchlistSection({
  watchlist,
  sortedWatchlist,
  watchlistCategory,
  onCategoryChange,
  newTicker,
  onTickerChange,
  newInterval,
  onIntervalChange,
  onAddSymbol,
  onRemoveSymbol,
  onQuickPresetAdd,
  watchlistView,
  onViewChange,
  filterMode,
  onFilterModeChange,
  autoPatternsEnabled,
  onToggleAutoPatterns,
  expandedRowIndex,
  onToggleRowExpansion,
  onRefreshItem,
  getMiniCandles,
  compactEntries,
  testResult,
  renderJustChartCanvas,
  categoryCounts,
  quickPresets,
}: WatchlistSectionProps) {
  return (
    <div className="space-y-4">
      {/* Category Pills & Ticker Input Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-card-bg/50 backdrop-blur-md p-4 rounded-2xl border border-card-border/60 shadow-sm">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 bg-muted-bg/60 p-1 rounded-xl border border-card-border/40">
          {(['all', 'stocks', 'crypto', 'futures'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                watchlistCategory === cat
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-muted hover:text-foreground hover:bg-card-bg/60'
              }`}
            >
              {cat} ({categoryCounts[cat]})
            </button>
          ))}
        </div>

        {/* Ticker Add Form */}
        <form onSubmit={onAddSymbol} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Add Ticker (e.g. NQ=F, AAPL, BTC-USD)"
            value={newTicker}
            onChange={(e) => onTickerChange(e.target.value)}
            className="bg-muted-bg border border-card-border focus:border-accent focus:ring-1 focus:ring-accent rounded-xl px-3 py-1.5 text-xs text-foreground outline-none w-48 uppercase font-bold"
          />
          <select
            value={newInterval}
            onChange={(e) => onIntervalChange(e.target.value)}
            className="bg-muted-bg border border-card-border focus:border-accent rounded-xl px-2.5 py-1.5 text-xs font-bold text-foreground cursor-pointer outline-none"
          >
            <option value="1m">1m</option>
            <option value="5m">5m</option>
            <option value="10m">10m</option>
            <option value="15m">15m</option>
            <option value="1h">1h</option>
            <option value="1d">1d</option>
          </select>
          <button
            type="submit"
            className="flex items-center gap-1 px-3 py-1.5 bg-accent hover:bg-accent/90 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
          >
            <Plus size={14} />
            <span>Add</span>
          </button>
        </form>
      </div>

      {/* Quick Presets Bar */}
      {watchlistCategory === 'futures' && (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted mr-1">Quick Presets:</span>
          {quickPresets.map((preset) => (
            <button
              key={preset.symbol}
              onClick={() => onQuickPresetAdd(preset.symbol)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-muted-bg/40 border border-card-border/40 text-muted hover:text-foreground hover:border-accent/40 transition-all"
            >
              <Plus size={10} />
              <span>{preset.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Filters & View Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted-bg/20 p-2.5 rounded-xl border border-card-border/40">
        <WatchlistViewToggle value={watchlistView} onChange={onViewChange} />

        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => onFilterModeChange('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              filterMode === 'all'
                ? 'bg-accent text-white shadow-sm'
                : 'bg-card-bg border border-card-border text-muted hover:text-foreground'
            }`}
          >
            All ({watchlist.length})
          </button>
          <button
            onClick={() => onFilterModeChange('alerts')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              filterMode === 'alerts'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'bg-card-bg border border-card-border text-muted hover:text-rose-400'
            }`}
          >
            Alerts ({watchlist.filter((w) => w.status === 'bullish' || w.status === 'bearish').length})
          </button>
          <button
            onClick={() => onFilterModeChange('errors')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              filterMode === 'errors'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-card-bg border border-card-border text-muted hover:text-amber-400'
            }`}
          >
            Errors ({watchlist.filter((w) => w.status === 'error').length})
          </button>

          <button
            onClick={onToggleAutoPatterns}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ml-1 ${
              autoPatternsEnabled
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-card-bg border-card-border text-muted hover:text-foreground'
            }`}
            title="Toggle Auto Patterns on Live Watchlist Charts"
          >
            <Sparkles size={12} className={autoPatternsEnabled ? 'text-amber-400 animate-pulse' : ''} />
            <span>Auto Patterns</span>
          </button>
        </div>
      </div>

      {/* Watchlist Items Display */}
      {sortedWatchlist.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-card-border p-10 text-center text-xs text-muted bg-card-bg/20">
          No symbols match the current search or category filter.
        </div>
      ) : watchlistView === 'compact' ? (
        <CompactWatchlist
          entries={compactEntries}
          expandedIndex={expandedRowIndex}
          expandedChart={renderJustChartCanvas()}
          onToggle={onToggleRowExpansion}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-card-border/60 bg-card-bg/40 backdrop-blur-md shadow-sm">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-card-border/60 bg-muted-bg/40 text-[10px] font-bold uppercase tracking-wider text-muted">
                <th className="py-3 px-4">Symbol</th>
                <th className="py-3 px-4">Last Candles</th>
                <th className="py-3 px-4">Last Check</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border/30">
              {sortedWatchlist.map((item, idx) => (
                <React.Fragment key={`${item.symbol}-${item.interval}`}>
                  <WatchlistRow
                    item={item}
                    index={idx}
                    miniCandles={getMiniCandles(item)}
                    onToggle={onToggleRowExpansion}
                    onRefresh={onRefreshItem}
                    onRemove={onRemoveSymbol}
                  />
                  {expandedRowIndex === idx && testResult && testResult.success && (
                    <tr>
                      <td colSpan={5} className="p-0 border-t border-b border-card-border/40">
                        {renderJustChartCanvas()}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default React.memo(WatchlistSection);

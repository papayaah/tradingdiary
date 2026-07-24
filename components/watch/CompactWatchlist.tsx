'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { Candle } from './watchAnalysis';

interface CompactWatchItem {
  symbol: string;
  interval: string;
  minMovePercent: number;
  lastChecked?: string;
  status?: 'bullish' | 'bearish' | 'none' | 'no-data' | 'error';
  lastError?: string;
}

export interface CompactWatchlistEntry {
  key: string;
  index: number;
  item: CompactWatchItem;
  miniCandles: Candle[];
}

interface CompactWatchlistProps {
  entries: CompactWatchlistEntry[];
  expandedIndex: number | null;
  expandedChart: React.ReactNode;
  onToggle: (index: number) => void;
}

const columnsForWidth = (width: number) => {
  if (width >= 1120) return 4;
  if (width >= 820) return 3;
  if (width >= 520) return 2;
  return 1;
};
const ROWS_PER_PAGE = 8;

const CompactCard = React.memo(function CompactCard({
  entry,
  expanded,
  onToggle,
}: {
  entry: CompactWatchlistEntry;
  expanded: boolean;
  onToggle: (index: number) => void;
}) {
  const { item, miniCandles, index } = entry;
  const latestPrice = miniCandles.at(-1)?.close;
  const statusColor =
    item.status === 'bullish'
      ? 'border-emerald-500/30 bg-emerald-500/5'
      : item.status === 'bearish'
        ? 'border-rose-500/30 bg-rose-500/5'
        : item.status === 'error' || item.status === 'no-data'
          ? 'border-amber-500/25 bg-amber-500/5'
          : 'border-card-border bg-card-bg';

  return (
    <button
      id={`row-${item.symbol.toUpperCase()}-${item.interval}`}
      type="button"
      onClick={() => onToggle(index)}
      className={`min-w-0 rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg ${
        expanded ? 'ring-1 ring-accent border-accent/60' : ''
      } ${statusColor}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-foreground">{item.symbol}</span>
            <span className="rounded bg-muted-bg px-1.5 py-0.5 text-[9px] font-mono text-muted">
              {item.interval}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-muted">
            {latestPrice === undefined ? 'No current price' : `$${latestPrice.toFixed(2)}`}
            <span className="mx-1.5 text-muted/30">·</span>
            Min {item.minMovePercent}%
          </div>
        </div>

        <div className="flex h-7 shrink-0 items-end gap-0.5">
          {miniCandles.length === 0 ? (
            <span className="self-center text-xs text-muted/50">—</span>
          ) : (
            miniCandles.map((candle) => (
              <span
                key={candle.time}
                className={`h-full w-2 rounded-[2px] ${
                  candle.close >= candle.open ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              />
            ))
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-card-border/30 pt-2">
        <div className="min-w-0 text-[10px] font-semibold">
          {item.status === 'bullish' ? (
            <span className="flex items-center gap-1 text-emerald-400">
              <TrendingUp size={11} /> Ascending
            </span>
          ) : item.status === 'bearish' ? (
            <span className="flex items-center gap-1 text-rose-400">
              <TrendingDown size={11} /> Descending
            </span>
          ) : item.status === 'error' ? (
            <span className="flex items-center gap-1 truncate text-amber-400" title={item.lastError}>
              <AlertTriangle size={11} /> Error
            </span>
          ) : item.status === 'no-data' ? (
            <span className="flex items-center gap-1 text-amber-400">
              <Clock size={11} /> No current data
            </span>
          ) : (
            <span className="text-muted">Normal</span>
          )}
        </div>
        <span className="shrink-0 text-[9px] font-mono text-muted/70">
          {item.lastChecked || 'Never'}
        </span>
      </div>
    </button>
  );
});

function CompactWatchlist({
  entries,
  expandedIndex,
  expandedChart,
  onToggle,
}: CompactWatchlistProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(1);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateColumns = (width: number) => {
      const nextColumns = columnsForWidth(width);
      setColumns((current) => (current === nextColumns ? current : nextColumns));
    };
    updateColumns(element.clientWidth);

    const observer = new ResizeObserver((records) => {
      updateColumns(records[0]?.contentRect.width ?? element.clientWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const pageSize = columns * ROWS_PER_PAGE;
  const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
  const expandedPosition =
    expandedIndex === null
      ? -1
      : entries.findIndex((entry) => entry.index === expandedIndex);
  const effectivePage =
    expandedPosition === -1
      ? Math.min(page, pageCount - 1)
      : Math.floor(expandedPosition / pageSize);

  const handleToggle = (index: number) => {
    setPage(effectivePage);
    onToggle(index);
  };
  const goToPage = (nextPage: number) => {
    setPage(nextPage);
    if (expandedIndex !== null) {
      onToggle(expandedIndex);
    }
  };

  const visibleEntries = useMemo(
    () => entries.slice(effectivePage * pageSize, (effectivePage + 1) * pageSize),
    [effectivePage, entries, pageSize],
  );

  const rows = useMemo(() => {
    const grouped: CompactWatchlistEntry[][] = [];
    for (let index = 0; index < visibleEntries.length; index += columns) {
      grouped.push(visibleEntries.slice(index, index + columns));
    }
    return grouped;
  }, [visibleEntries, columns]);

  const rangeStart = entries.length === 0 ? 0 : effectivePage * pageSize + 1;
  const rangeEnd = Math.min(entries.length, (effectivePage + 1) * pageSize);

  return (
    <div ref={containerRef} className="space-y-3">
      {entries.length > pageSize ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-card-border/50 bg-muted-bg/20 px-3 py-2 text-[10px] text-muted">
          <span>
            Showing <strong className="text-foreground">{rangeStart}–{rangeEnd}</strong> of{' '}
            <strong className="text-foreground">{entries.length}</strong> monitored symbols
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(Math.max(0, effectivePage - 1))}
              disabled={effectivePage === 0}
              className="rounded-md border border-card-border bg-card-bg p-1 text-foreground transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-35"
              title="Previous symbols"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="min-w-16 text-center font-mono">
              {effectivePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => goToPage(Math.min(pageCount - 1, effectivePage + 1))}
              disabled={effectivePage >= pageCount - 1}
              className="rounded-md border border-card-border bg-card-bg p-1 text-foreground transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-35"
              title="Next symbols"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      ) : null}
      {rows.map((row) => {
        const rowHasExpandedItem = row.some((entry) => entry.index === expandedIndex);
        return (
          <React.Fragment key={row.map((entry) => entry.key).join('|')}>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {row.map((entry) => (
                <CompactCard
                  key={entry.key}
                  entry={entry}
                  expanded={entry.index === expandedIndex}
                  onToggle={handleToggle}
                />
              ))}
            </div>
            {rowHasExpandedItem && expandedChart ? (
              <div className="overflow-hidden rounded-xl border border-card-border bg-slate-900">
                {expandedChart}
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default React.memo(CompactWatchlist);

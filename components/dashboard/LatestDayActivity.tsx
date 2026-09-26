'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Activity, Calendar, ChevronDown } from 'lucide-react';
import type { TransactionRecord } from '@/lib/db/schema';
import type { DailySummary } from '@/lib/trading/aggregator';
import type { PnLSnapshot } from '@/lib/replay/engine';
import { executionInstant } from '@/lib/replay/engine';
import { formatCurrency } from '@/lib/currency';
import { formatInstantClock } from '@/lib/chart/execution-time';

const ReplayTimeline = dynamic(() => import('@/components/replay/ReplayTimeline'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-48 items-center justify-center text-sm text-muted">
      Loading execution timeline…
    </div>
  ),
});

const DEFAULT_VISIBLE_SYMBOLS = 5;

interface LatestDayActivityProps {
  summary: DailySummary;
  transactions: TransactionRecord[];
  symbols: string[];
  startTimeSeconds: number;
  endTimeSeconds: number;
  snapshots: PnLSnapshot[];
  currency: string;
  timeZone: string;
}

interface SymbolActivity {
  symbol: string;
  executionTimes: number[];
  executionCount: number;
  firstTime: number;
  lastTime: number;
  netPnL: number;
}

function pnlClass(value: number): string {
  if (value > 0) return 'text-profit';
  if (value < 0) return 'text-loss';
  return 'text-muted';
}

export default function LatestDayActivity({
  summary,
  transactions,
  symbols,
  startTimeSeconds,
  endTimeSeconds,
  snapshots,
  currency,
  timeZone,
}: LatestDayActivityProps) {
  const [showAllSymbols, setShowAllSymbols] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

  const { rows, firstExecution, lastExecution } = useMemo(() => {
    const pnlBySymbol = new Map<string, number>();
    for (const trade of summary.trades) {
      pnlBySymbol.set(
        trade.symbol,
        (pnlBySymbol.get(trade.symbol) ?? 0) + trade.netPnL,
      );
    }

    const timesBySymbol = new Map<string, number[]>();
    for (const transaction of transactions) {
      const timestamp = executionInstant(transaction);
      const times = timesBySymbol.get(transaction.symbol) ?? [];
      times.push(timestamp);
      timesBySymbol.set(transaction.symbol, times);
    }

    const activityRows = symbols.flatMap((symbol): SymbolActivity[] => {
      const executionTimes = (timesBySymbol.get(symbol) ?? []).sort((a, b) => a - b);
      if (executionTimes.length === 0) return [];
      return [{
        symbol,
        executionTimes,
        executionCount: executionTimes.length,
        firstTime: executionTimes[0],
        lastTime: executionTimes[executionTimes.length - 1],
        netPnL: pnlBySymbol.get(symbol) ?? 0,
      }];
    });

    const allTimes = activityRows.flatMap((row) => row.executionTimes);
    return {
      rows: activityRows,
      firstExecution: Math.min(...allTimes),
      lastExecution: Math.max(...allTimes),
    };
  }, [summary.trades, symbols, transactions]);

  const visibleRows = showAllSymbols
    ? rows
    : rows.slice(0, DEFAULT_VISIBLE_SYMBOLS);
  const hiddenSymbolCount = Math.max(0, rows.length - DEFAULT_VISIBLE_SYMBOLS);
  const executionRange = Math.max(1, lastExecution - firstExecution);

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-card-border bg-card-bg shadow-sm">
      <div className="flex flex-col gap-4 border-b border-card-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Calendar size={15} className="shrink-0 text-accent" />
              Latest Day Activity
            </h3>
            <span className="hidden text-muted/50 sm:inline" aria-hidden="true">·</span>
            <p className="text-xs text-muted">{summary.formattedDate}</p>
          </div>
          <p className="mt-2 text-sm text-muted">
            {transactions.length} execution{transactions.length === 1 ? '' : 's'} across{' '}
            {rows.length} symbol{rows.length === 1 ? '' : 's'}
            <span className="mx-2 text-muted/50" aria-hidden="true">•</span>
            {formatInstantClock(firstExecution, timeZone)}–{formatInstantClock(lastExecution, timeZone)}
          </p>
        </div>

        <div className="sm:text-right">
          <p className="text-xs text-muted">Net P&amp;L</p>
          <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${pnlClass(summary.netPnL)}`}>
            {formatCurrency(summary.netPnL, currency)}
          </p>
        </div>
      </div>

      <div className="hidden grid-cols-[minmax(10rem,15rem)_minmax(16rem,1fr)_7rem_9rem] gap-4 border-b border-card-border bg-muted-bg px-5 py-2 text-xs font-medium text-muted md:grid md:px-6">
        <span>Symbol</span>
        <span>Activity</span>
        <span className="text-right">Executions</span>
        <span className="text-right">Net P&amp;L</span>
      </div>

      <div className="divide-y divide-card-border">
        {visibleRows.map((row) => (
          <div
            key={row.symbol}
            className="grid gap-2.5 px-5 py-3 transition-colors hover:bg-muted-bg/40 md:min-h-14 md:grid-cols-[minmax(10rem,15rem)_minmax(16rem,1fr)_7rem_9rem] md:items-center md:gap-4 md:px-6 md:py-2"
          >
            <div className="flex min-w-0 items-center justify-between gap-4 md:block">
              <span className="truncate text-sm font-semibold text-foreground" title={row.symbol}>
                {row.symbol}
              </span>
              <span className={`shrink-0 text-sm font-semibold tabular-nums md:hidden ${pnlClass(row.netPnL)}`}>
                {formatCurrency(row.netPnL, currency)}
              </span>
            </div>

            <div className="min-w-0">
              <div className="relative h-2.5" aria-hidden="true">
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-card-border" />
                {row.executionTimes.map((timestamp, index) => {
                  const left = ((timestamp - firstExecution) / executionRange) * 100;
                  return (
                    <span
                      key={`${timestamp}-${index}`}
                      className="absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-accent"
                      style={{ left: `${left}%` }}
                    />
                  );
                })}
              </div>
              <p className="mt-0.5 text-xs tabular-nums text-muted">
                {formatInstantClock(row.firstTime, timeZone)}
                {row.firstTime !== row.lastTime && (
                  <>–{formatInstantClock(row.lastTime, timeZone)}</>
                )}
              </p>
            </div>

            <p className="text-xs text-muted md:text-right">
              <span className="md:hidden">{row.executionCount} execution{row.executionCount === 1 ? '' : 's'}</span>
              <span className="hidden text-sm tabular-nums text-foreground md:inline">{row.executionCount}</span>
            </p>

            <p className={`hidden text-right text-sm font-semibold tabular-nums md:block ${pnlClass(row.netPnL)}`}>
              {formatCurrency(row.netPnL, currency)}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col border-t border-card-border sm:flex-row sm:items-center sm:justify-between">
        {hiddenSymbolCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowAllSymbols((visible) => !visible)}
            className="inline-flex min-h-11 items-center justify-center gap-2 px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted-bg sm:justify-start sm:px-6"
            aria-expanded={showAllSymbols}
          >
            {showAllSymbols
              ? `Show first ${DEFAULT_VISIBLE_SYMBOLS} symbols`
              : `Show ${hiddenSymbolCount} more symbol${hiddenSymbolCount === 1 ? '' : 's'}`}
            <ChevronDown
              size={15}
              className={`transition-transform ${showAllSymbols ? 'rotate-180' : ''}`}
            />
          </button>
        ) : <span />}

        <button
          type="button"
          onClick={() => setShowTimeline((visible) => !visible)}
          className="inline-flex min-h-11 items-center justify-center gap-2 border-t border-card-border px-5 text-sm font-medium text-accent transition-colors hover:bg-muted-bg sm:border-l sm:border-t-0"
          aria-expanded={showTimeline}
        >
          <Activity size={15} />
          {showTimeline ? 'Hide execution timeline' : 'View execution timeline'}
          <ChevronDown
            size={15}
            className={`transition-transform ${showTimeline ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {showTimeline && (
        <div className="overflow-x-auto border-t border-card-border bg-muted-bg px-3 py-4 sm:px-5">
          <div className="min-w-[44rem] rounded-lg border border-card-border bg-card-bg p-3">
            <ReplayTimeline
              transactions={transactions}
              symbols={symbols}
              currentTimeSeconds={endTimeSeconds}
              startTimeSeconds={startTimeSeconds}
              endTimeSeconds={endTimeSeconds}
              snapshots={snapshots}
              timeZone={timeZone}
            />
          </div>
        </div>
      )}
    </section>
  );
}

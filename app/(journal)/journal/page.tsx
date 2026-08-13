'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Upload, BookOpen, ArrowLeft, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { getTradeDateCutoff } from '@/lib/settings';
import { aggregateByDay, applyMarketPrices, type DailySummary } from '@/lib/trading/aggregator';
import DayGroup from '@/components/journal/DayGroup';
import { useAccount } from '@/contexts/AccountContext';
import { getTransactionsByAccount } from '@/lib/db/trades';
import { ManualTradePanel } from '@/components/trades/manual-entry/ManualTradePanel';

export default function JournalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterDate = searchParams.get('date');
  const focusSymbol = searchParams.get('symbol')?.toUpperCase();
  const openDailyNotes = searchParams.get('notes') === 'open';
  const { selectedAccountId } = useAccount();

  const [summaries, setSummaries] = useState<DailySummary[] | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const manualEntryVisible = showManualEntry || searchParams.get('action') === 'add-trade';

  const closeManualEntry = useCallback(() => {
    setShowManualEntry(false);
    if (searchParams.get('action') !== 'add-trade') return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('action');
    const query = params.toString();
    router.replace(query ? `/journal?${query}` : '/journal', { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    async function load() {
      if (!selectedAccountId) {
        setSummaries([]);
        return;
      }

      setSummaries(null); // Show loading state on switch
      const transactions = await getTransactionsByAccount(selectedAccountId);

      if (transactions.length > 0) {
        const agg = aggregateByDay(transactions, getTradeDateCutoff());

        // --- 1. SET INITIAL DATA IMMEDIATELY ---
        setSummaries([...agg]);

        // Fetch historical market prices for open positions
        const openSymbols = new Set<string>();
        let minDate = '';
        let maxDate = '';
        for (const day of agg) {
          for (const trade of day.trades) {
            if (trade.isOpen) {
              openSymbols.add(trade.symbol);
              if (!minDate || day.date < minDate) minDate = day.date;
              if (!maxDate || day.date > maxDate) maxDate = day.date;
            }
          }
        }
        if (openSymbols.size > 0) {
          try {
            const params = new URLSearchParams({
              symbols: [...openSymbols].join(','),
              from: minDate,
              to: maxDate,
            });
            const res = await fetch(`/api/quotes?${params}`);
            if (res.ok) {
              const prices = await res.json();

              // --- 2. UPDATE WITH MARKET PRICES ---
              applyMarketPrices(agg, prices);
              setSummaries([...agg]);
            }
          } catch {
            // Silently fail
          }
        }
      } else {
        setSummaries([]);
      }
    }
    load();
  }, [selectedAccountId, refreshKey]);

  const displaySummaries = useMemo(() => {
    if (!summaries || !filterDate) return summaries;
    return summaries.filter(s => s.date === filterDate);
  }, [summaries, filterDate]);

  const currentDayIndex = useMemo(() => {
    if (!summaries || !filterDate) return -1;
    return summaries.findIndex((summary) => summary.date === filterDate);
  }, [summaries, filterDate]);

  const previousDay = currentDayIndex >= 0 ? summaries?.[currentDayIndex + 1] : undefined;
  const nextDay = currentDayIndex > 0 ? summaries?.[currentDayIndex - 1] : undefined;

  const navigateToDay = useCallback((date: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('date', date);
    router.push(`/journal?${params.toString()}`);
  }, [router, searchParams]);

  useEffect(() => {
    if (!filterDate) return;

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (target.isContentEditable
          || target.tagName === 'INPUT'
          || target.tagName === 'TEXTAREA'
          || target.tagName === 'SELECT')
      ) {
        return;
      }

      if (event.key === 'ArrowLeft' && previousDay) {
        event.preventDefault();
        navigateToDay(previousDay.date);
      } else if (event.key === 'ArrowRight' && nextDay) {
        event.preventDefault();
        navigateToDay(nextDay.date);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filterDate, navigateToDay, nextDay, previousDay]);

  if (summaries === null) {
    // ... animation placeholder
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-48 rounded-xl bg-card-bg border border-card-border animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center gap-7 p-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted-bg">
            <BookOpen size={32} className="text-muted" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-foreground">No trades yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            Add one manually below, or import your existing trading history.
          </p>
          <Link
            href="/import"
            className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-accent hover:underline"
          >
            <Upload size={15} />
            Import instead
          </Link>
        </div>
        <ManualTradePanel
          title="Add your first trade"
          onSaved={() => setRefreshKey((key) => key + 1)}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-8 w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="hidden sm:block text-3xl font-semibold text-foreground tracking-tight mb-1">Trading Journal</h1>
          <p className="text-sm text-muted font-medium">Capture your trades, thoughts, and market analysis.</p>
        </div>
        <button
          type="button"
          onClick={() => manualEntryVisible ? closeManualEntry() : setShowManualEntry(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-white transition hover:bg-accent/90"
        >
          <Plus size={16} />
          Add Trade
        </button>
      </div>

      {manualEntryVisible && (
        <ManualTradePanel
          onClose={closeManualEntry}
          onSaved={() => {
            setRefreshKey((key) => key + 1);
            closeManualEntry();
          }}
        />
      )}

      {filterDate && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-accent/5 backdrop-blur-sm p-5 rounded-2xl border border-accent/20 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-accent/10 rounded-xl text-accent shadow-inner">
              <BookOpen size={24} />
            </div>
            <div>
              <h3 className="font-bold text-foreground">Showing {filterDate.substring(0, 4)}-{filterDate.substring(4, 6)}-{filterDate.substring(6, 8)}</h3>
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-0.5">Focusing on {displaySummaries?.length || 0} trading day</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl border border-accent/10 bg-accent/10 p-1">
              <button
                type="button"
                onClick={() => previousDay && navigateToDay(previousDay.date)}
                disabled={!previousDay}
                aria-label="View previous trading day"
                title="Previous trading day (Left Arrow)"
                className="inline-flex h-8 w-9 items-center justify-center rounded-lg text-accent transition-colors hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeft size={17} />
              </button>
              <span className="hidden px-2 text-[10px] font-bold uppercase tracking-wider text-muted lg:inline">
                Use arrow keys
              </span>
              <button
                type="button"
                onClick={() => nextDay && navigateToDay(nextDay.date)}
                disabled={!nextDay}
                aria-label="View next trading day"
                title="Next trading day (Right Arrow)"
                className="inline-flex h-8 w-9 items-center justify-center rounded-lg text-accent transition-colors hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight size={17} />
              </button>
            </div>
            <Link
              href="/journal"
              className="flex items-center gap-2 text-xs font-bold text-accent hover:text-accent/80 transition-colors bg-accent/10 hover:bg-accent/20 px-4 py-2.5 rounded-xl border border-accent/10"
            >
              <ArrowLeft size={14} />
              Show All History
            </Link>
          </div>
        </div>
      )}

      {displaySummaries?.map((summary) => (
        <DayGroup
          key={`${summary.date}-${focusSymbol || 'all'}-${openDailyNotes ? 'notes' : 'closed'}`}
          summary={summary}
          accountId={selectedAccountId || ''}
          focusSymbol={summary.date === filterDate ? focusSymbol : undefined}
          openNotes={summary.date === filterDate && openDailyNotes}
        />
      ))}

      {filterDate && displaySummaries?.length === 0 && (
        <div className="py-20 text-center">
          <p className="text-muted">No trades found for this specific date.</p>
          <Link href="/journal" className="text-accent hover:underline mt-2 inline-block">Back to full journal</Link>
        </div>
      )}
    </div>
  );
}

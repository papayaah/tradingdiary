'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Upload, BookOpen, ArrowLeft, ChevronLeft, ChevronRight, Plus, Sparkles } from 'lucide-react';
import {
  getShowPnlInBaseCurrency,
  setShowPnlInBaseCurrency,
} from '@/lib/settings';
import { aggregateTradeGroupsByDay, applyMarketPrices, type DailySummary } from '@/lib/trading/aggregator';
import { onJournalSynced } from '@/lib/journal/sync-bus';
import SyncStatusIndicator from '@/components/journal/SyncStatusIndicator';
import DayGroup from '@/components/journal/DayGroup';
import { useAccount } from '@/contexts/AccountContext';
import { getTransactionsByAccount } from '@/lib/db/trades';
import { ManualTradePanel } from '@/components/trades/manual-entry/ManualTradePanel';
import { loadDemoSampleData } from '@/lib/import/sample-loader';
import { toast } from 'sonner';

export default function JournalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterDate = searchParams.get('date');
  const focusSymbol = searchParams.get('symbol')?.toUpperCase();
  const openDailyNotes = searchParams.get('notes') === 'open';
  const { accounts, selectedAccountId, setSelectedAccountId } = useAccount();
  const baseCurrency = accounts.find((account) => account.accountId === selectedAccountId)?.currency ?? 'USD';

  const [summaries, setSummaries] = useState<DailySummary[] | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showBaseCurrency, setShowBaseCurrency] = useState(false);

  useEffect(() => {
    setShowBaseCurrency(getShowPnlInBaseCurrency());
  }, []);

  // Reload the journal when a sync merged remote changes into IndexedDB.
  useEffect(() => onJournalSynced(() => setRefreshKey((k) => k + 1)), []);

  const toggleBaseCurrency = useCallback(() => {
    setShowBaseCurrency((current) => {
      const next = !current;
      setShowPnlInBaseCurrency(next);
      return next;
    });
  }, []);

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
        const agg = aggregateTradeGroupsByDay(transactions);

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

  const normalizedFilterDate = useMemo(() => {
    return filterDate?.replace(/-/g, '');
  }, [filterDate]);

  const displaySummaries = useMemo(() => {
    if (!summaries || !normalizedFilterDate) return summaries;
    return summaries.filter(s => s.date === normalizedFilterDate);
  }, [summaries, normalizedFilterDate]);

  const currentDayIndex = useMemo(() => {
    if (!summaries || !normalizedFilterDate) return -1;
    return summaries.findIndex((summary) => summary.date === normalizedFilterDate);
  }, [summaries, normalizedFilterDate]);

  const previousDay = useMemo(() => {
    if (!summaries || summaries.length === 0) return undefined;
    if (currentDayIndex === -1) {
      return summaries.length > 1 ? summaries[1] : undefined;
    }
    return currentDayIndex < summaries.length - 1 ? summaries[currentDayIndex + 1] : undefined;
  }, [summaries, currentDayIndex]);

  const nextDay = useMemo(() => {
    if (!summaries || summaries.length === 0) return undefined;
    if (currentDayIndex === -1) {
      return summaries[0];
    }
    return currentDayIndex > 0 ? summaries[currentDayIndex - 1] : undefined;
  }, [summaries, currentDayIndex]);

  const navigateToDay = useCallback((date: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('date', date);
    router.push(`/journal?${params.toString()}`);
  }, [router, searchParams]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (manualEntryVisible) return;

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
  }, [navigateToDay, nextDay, previousDay, manualEntryVisible]);

  const handleLoadSample = async () => {
    try {
      setLoadingSample(true);
      const res = await loadDemoSampleData();
      setSelectedAccountId(res.accountId);
      setRefreshKey((k) => k + 1);
      toast.success(`Loaded ${res.transactionCount} sample IBKR trades!`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load sample data.');
    } finally {
      setLoadingSample(false);
    }
  };

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
            Add one manually below, try out sample data, or import your existing trading history.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleLoadSample}
              disabled={loadingSample}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-bold text-white transition hover:bg-accent/90 disabled:opacity-50"
            >
              <Sparkles size={15} />
              {loadingSample ? 'Loading sample data...' : 'Load Sample Trades'}
            </button>
            <Link
              href="/import"
              className="inline-flex items-center gap-2 rounded-xl border border-card-border bg-card-bg px-4 py-2.5 text-xs font-bold text-foreground transition hover:bg-sidebar-hover"
            >
              <Upload size={15} />
              Import File
            </Link>
          </div>
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
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="hidden sm:block text-3xl font-semibold text-foreground tracking-tight mb-1">Trading Journal</h1>
          <p className="text-sm text-muted font-medium">Capture your trades, thoughts, and market analysis.</p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <SyncStatusIndicator />
          {displaySummaries && displaySummaries.length > 0 && (
            <button
              type="button"
              role="switch"
              aria-checked={showBaseCurrency}
              aria-label={`Show P&L in base currency (${baseCurrency})`}
              title={`Show P&L in base currency (${baseCurrency})`}
              onClick={toggleBaseCurrency}
              className={`inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl border px-3 text-xs font-semibold transition-colors ${
                showBaseCurrency
                  ? 'border-accent/30 bg-accent/10 text-accent'
                  : 'border-card-border bg-card-bg text-muted hover:bg-muted-bg hover:text-foreground'
              }`}
            >
              <span
                aria-hidden="true"
                className={`relative inline-flex h-5 w-9 shrink-0 overflow-hidden rounded-full transition-colors ${showBaseCurrency ? 'bg-accent' : 'bg-muted-bg'}`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${showBaseCurrency ? 'translate-x-4' : 'translate-x-0'}`}
                />
              </span>
              {baseCurrency}
            </button>
          )}
          <button
            type="button"
            onClick={() => manualEntryVisible ? closeManualEntry() : setShowManualEntry(true)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-white transition hover:bg-accent/90"
          >
            <Plus size={16} />
            Add Trade
          </button>
        </div>
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

      {displaySummaries?.map((summary) => {
        const indexInAll = summaries?.findIndex(s => s.date === summary.date) ?? -1;
        const prev = indexInAll >= 0 && indexInAll < (summaries?.length || 0) - 1 ? summaries?.[indexInAll + 1] : undefined;
        const next = indexInAll > 0 ? summaries?.[indexInAll - 1] : undefined;

        return (
          <DayGroup
            key={`${summary.date}-${focusSymbol || 'all'}-${openDailyNotes ? 'notes' : 'closed'}`}
            summary={summary}
            accountId={selectedAccountId || ''}
            focusSymbol={summary.date === filterDate ? focusSymbol : undefined}
            openNotes={summary.date === filterDate && openDailyNotes}
            onPrevDay={prev ? () => navigateToDay(prev.date) : undefined}
            onNextDay={next ? () => navigateToDay(next.date) : undefined}
            hasPrevDay={Boolean(prev)}
            hasNextDay={Boolean(next)}
            showBaseCurrency={showBaseCurrency}
          />
        );
      })}

      {filterDate && displaySummaries?.length === 0 && (
        <div className="py-20 text-center">
          <p className="text-muted">No trades found for this specific date.</p>
          <Link href="/journal" className="text-accent hover:underline mt-2 inline-block">Back to full journal</Link>
        </div>
      )}
    </div>
  );
}

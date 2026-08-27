'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Upload, BookOpen, ArrowLeft, ChevronLeft, ChevronRight, Plus, Sparkles, Link2 } from 'lucide-react';
import {
  getShowPnlInBaseCurrency,
  setShowPnlInBaseCurrency,
} from '@/lib/settings';
import { aggregateByDay, applyMarketPrices, type DailySummary, type AggregatedTrade } from '@/lib/trading/aggregator';
import { onJournalSynced } from '@/lib/journal/sync-bus';
import SyncStatusIndicator from '@/components/journal/SyncStatusIndicator';
import DayGroup from '@/components/journal/DayGroup';
import JournalTagFilter from '@/components/journal/JournalTagFilter';
import { useAccount } from '@/contexts/AccountContext';
import { getTransactionsByAccount } from '@/lib/db/trades';
import { getAllTags } from '@/lib/db/tags';
import { getAllTradeNotes } from '@/lib/db/notes';
import type { TagRecord } from '@/lib/db/schema';
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
  // Tag filter: applied tags + a map of trade-group key → its tag ids.
  const [allTags, setAllTags] = useState<TagRecord[]>([]);
  const [noteTagsByKey, setNoteTagsByKey] = useState<Record<string, string[]>>({});
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showBaseCurrency, setShowBaseCurrency] = useState(false);
  // True while open-position quotes are in flight, so their P&L cells can show a
  // per-cell loading indicator instead of blocking the whole page.
  const [pricesLoading, setPricesLoading] = useState(false);
  // Tracks the open-position scope we've already priced, so applying quotes
  // (which re-renders) can't re-trigger the quotes effect into a loop.
  const pricedScopeRef = useRef<string>('');

  useEffect(() => {
    setShowBaseCurrency(getShowPnlInBaseCurrency());
  }, []);

  // Reload the journal when a sync merged remote changes into IndexedDB.
  useEffect(() => onJournalSynced(() => setRefreshKey((k) => k + 1)), []);

  // Deep-link IN only: an ?account=<id> param selects that account so a shared
  // /journal?date=...&account=... link opens the right one. This effect ONLY
  // reads the URL and sets state — it never writes the URL back (that reactive
  // writeback is what previously caused an infinite navigation loop). The ref
  // ensures each distinct param value is applied at most once, so setting state
  // (which re-runs the effect) can't re-fire. Sharing is handled by an explicit
  // Copy-link button, not by mirroring state into the URL.
  const appliedAccountParamRef = useRef<string | null>(null);
  useEffect(() => {
    const param = searchParams.get('account');
    if (!param || accounts.length === 0) return;
    if (param === appliedAccountParamRef.current) return;
    if (param === selectedAccountId) {
      appliedAccountParamRef.current = param;
      return;
    }
    if (accounts.some((account) => account.accountId === param)) {
      appliedAccountParamRef.current = param;
      setSelectedAccountId(param);
    }
  }, [searchParams, accounts, selectedAccountId, setSelectedAccountId]);

  const handleCopyLink = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterDate) params.set('date', filterDate);
    if (selectedAccountId) params.set('account', selectedAccountId);
    const query = params.toString();
    const url = `${window.location.origin}/journal${query ? `?${query}` : ''}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Journal link copied to clipboard');
    } catch {
      toast.error('Could not copy link');
    }
  }, [filterDate, selectedAccountId]);

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

  // Load trades from IndexedDB and render immediately. Market prices for open
  // positions are fetched separately (below) so the P&L/list never waits on a
  // network call. Runs once per account/refresh — date navigation does NOT
  // reload, keeping arrow-key paging instant.
  useEffect(() => {
    async function load() {
      if (!selectedAccountId) {
        setSummaries([]);
        return;
      }
      setSummaries(null); // Show loading state on switch
      pricedScopeRef.current = ''; // new dataset → allow re-pricing
      const transactions = await getTransactionsByAccount(selectedAccountId);
      setSummaries(transactions.length > 0 ? aggregateByDay(transactions) : []);
    }
    load();
  }, [selectedAccountId, refreshKey]);

  // Load tags + per-trade tag links for the tag filter. Refreshes with the
  // journal (account switch, sync merge, local edits bump refreshKey).
  useEffect(() => {
    let active = true;
    (async () => {
      const [tags, notes] = await Promise.all([getAllTags(), getAllTradeNotes()]);
      if (!active) return;
      setAllTags(tags);
      const byKey: Record<string, string[]> = {};
      for (const note of notes) {
        if (note.tagIds && note.tagIds.length > 0) byKey[note.tradeGroupKey] = note.tagIds;
      }
      setNoteTagsByKey(byKey);
    })();
    return () => {
      active = false;
    };
  }, [selectedAccountId, refreshKey]);

  // Only offer tags that are actually applied to a trade in this account.
  const inUseTags = useMemo(() => {
    const used = new Set(Object.values(noteTagsByKey).flat());
    return allTags.filter((t) => used.has(t.id));
  }, [allTags, noteTagsByKey]);

  const tradeKey = useCallback(
    (t: AggregatedTrade) => t.groupKey ?? `${t.date}:${t.symbol}:${selectedAccountId ?? ''}`,
    [selectedAccountId],
  );

  // When tags are selected, keep only trades carrying any of them, then
  // re-aggregate so each day's header/stats reflect the filtered set exactly.
  const baseSummaries = useMemo(() => {
    if (!summaries || selectedTagIds.length === 0) return summaries;
    const sel = new Set(selectedTagIds);
    const matchKeys = new Set<string>();
    for (const [key, ids] of Object.entries(noteTagsByKey)) {
      if (ids.some((id) => sel.has(id))) matchKeys.add(key);
    }
    const txns = summaries
      .flatMap((s) => s.trades)
      .filter((t) => matchKeys.has(tradeKey(t)))
      .flatMap((t) => t.transactions);
    return txns.length > 0 ? aggregateByDay(txns) : [];
  }, [summaries, selectedTagIds, noteTagsByKey, tradeKey]);

  const toggleTag = useCallback((tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  }, []);

  const normalizedFilterDate = useMemo(() => {
    return filterDate?.replace(/-/g, '');
  }, [filterDate]);

  // Price ONLY the open positions relevant to what's on screen. When focused on a
  // single date, other days' open positions aren't shown, so a day with nothing
  // open (every trade closed) fetches nothing at all — no more 40-symbol call on
  // a fully-closed day. The scope ref makes applying prices idempotent: the
  // resulting setSummaries re-runs this effect, the scope key is unchanged, and
  // it early-returns instead of looping.
  useEffect(() => {
    if (!summaries || summaries.length === 0) return;
    const days = normalizedFilterDate
      ? summaries.filter((s) => s.date === normalizedFilterDate)
      : summaries;

    const openSymbols = new Set<string>();
    let minDate = '';
    let maxDate = '';
    for (const day of days) {
      for (const trade of day.trades) {
        if (trade.isOpen) {
          openSymbols.add(trade.symbol);
          if (!minDate || day.date < minDate) minDate = day.date;
          if (!maxDate || day.date > maxDate) maxDate = day.date;
        }
      }
    }
    if (openSymbols.size === 0) {
      setPricesLoading(false); // nothing open on this view → no spinner
      return;
    }

    const scopeKey = `${[...openSymbols].sort().join(',')}|${minDate}|${maxDate}`;
    if (scopeKey === pricedScopeRef.current) return;
    pricedScopeRef.current = scopeKey;

    let cancelled = false;
    setPricesLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams({
          symbols: [...openSymbols].join(','),
          from: minDate,
          to: maxDate,
        });
        const res = await fetch(`/api/quotes?${params}`);
        if (!res.ok || cancelled) return;
        const prices = await res.json();
        applyMarketPrices(summaries, prices);
        setSummaries((prev) => (prev ? [...prev] : prev));
      } catch {
        // Silently fail — open positions just won't show unrealized P&L.
      } finally {
        if (!cancelled) setPricesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summaries, normalizedFilterDate]);

  const displaySummaries = useMemo(() => {
    if (!baseSummaries || !normalizedFilterDate) return baseSummaries;
    return baseSummaries.filter(s => s.date === normalizedFilterDate);
  }, [baseSummaries, normalizedFilterDate]);

  const currentDayIndex = useMemo(() => {
    if (!baseSummaries || !normalizedFilterDate) return -1;
    return baseSummaries.findIndex((summary) => summary.date === normalizedFilterDate);
  }, [baseSummaries, normalizedFilterDate]);

  const previousDay = useMemo(() => {
    if (!baseSummaries || baseSummaries.length === 0) return undefined;
    if (currentDayIndex === -1) {
      return baseSummaries.length > 1 ? baseSummaries[1] : undefined;
    }
    return currentDayIndex < baseSummaries.length - 1 ? baseSummaries[currentDayIndex + 1] : undefined;
  }, [baseSummaries, currentDayIndex]);

  const nextDay = useMemo(() => {
    if (!baseSummaries || baseSummaries.length === 0) return undefined;
    if (currentDayIndex === -1) {
      return baseSummaries[0];
    }
    return currentDayIndex > 0 ? baseSummaries[currentDayIndex - 1] : undefined;
  }, [baseSummaries, currentDayIndex]);

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
          <button
            type="button"
            onClick={handleCopyLink}
            title="Copy a shareable link to this journal view (date + account)"
            aria-label="Copy link to this journal view"
            className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl border border-card-border bg-card-bg px-3 text-xs font-semibold text-muted transition-colors hover:bg-muted-bg hover:text-foreground"
          >
            <Link2 size={15} />
            <span className="hidden sm:inline">Copy link</span>
          </button>
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

      <JournalTagFilter
        tags={inUseTags}
        selected={selectedTagIds}
        onToggle={toggleTag}
        onClear={() => setSelectedTagIds([])}
      />

      {selectedTagIds.length > 0 && displaySummaries?.length === 0 && (
        <div className="py-16 text-center text-sm text-muted">
          No trades match the selected tag{selectedTagIds.length === 1 ? '' : 's'}.
        </div>
      )}

      {displaySummaries?.map((summary) => {
        const indexInAll = baseSummaries?.findIndex(s => s.date === summary.date) ?? -1;
        const prev = indexInAll >= 0 && indexInAll < (baseSummaries?.length || 0) - 1 ? baseSummaries?.[indexInAll + 1] : undefined;
        const next = indexInAll > 0 ? baseSummaries?.[indexInAll - 1] : undefined;

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
            pricesLoading={pricesLoading}
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

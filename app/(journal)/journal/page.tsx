'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Upload, BookOpen, Plus, Sparkles, Link2, MoreHorizontal } from 'lucide-react';
import { applyMarketPrices, type DailySummary } from '@/lib/trading/aggregator';
import { getJournalSummaries, peekJournalSummaries } from '@/lib/trading/journal-summaries-cache';
import { onJournalSynced } from '@/lib/journal/sync-bus';
import SyncStatusIndicator from '@/components/journal/SyncStatusIndicator';
import FlexSyncControl from '@/components/import/ibkr-flex/FlexSyncControl';
import PaperJournalList from '@/components/journal/PaperJournalList';
import { useAccount } from '@/contexts/AccountContext';
import { ManualTradePanel } from '@/components/trades/manual-entry/ManualTradePanel';
import { loadDemoSampleData } from '@/lib/import/sample-loader';
import { toast } from 'sonner';

export default function JournalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accounts, selectedAccountId, setSelectedAccountId } = useAccount();
  const currency = accounts.find((a) => a.accountId === selectedAccountId)?.currency ?? 'USD';

  const [summaries, setSummaries] = useState<DailySummary[] | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pricedScopeRef = useRef<string>('');
  const shownAccountRef = useRef<string | null>(null);

  // Legacy deep links (/journal?date=YYYY-MM-DD) now resolve to the single-day
  // view at its pretty URL.
  useEffect(() => {
    const raw = searchParams.get('date');
    if (!raw) return;
    const key = raw.replace(/-/g, '');
    if (/^\d{8}$/.test(key)) {
      router.replace(`/journal/${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`);
    }
  }, [searchParams, router]);

  // Reload when a sync merges remote changes.
  useEffect(() => onJournalSynced(() => setRefreshKey((k) => k + 1)), []);

  // Deep-link IN only: ?account=<id> selects that account without writing back.
  const appliedAccountParamRef = useRef<string | null>(null);
  useEffect(() => {
    const param = searchParams.get('account');
    if (!param || accounts.length === 0) return;
    if (param === appliedAccountParamRef.current) return;
    if (param === selectedAccountId) {
      appliedAccountParamRef.current = param;
      return;
    }
    if (accounts.some((a) => a.accountId === param)) {
      appliedAccountParamRef.current = param;
      setSelectedAccountId(param);
    }
  }, [searchParams, accounts, selectedAccountId, setSelectedAccountId]);

  const manualEntryVisible = showManualEntry || searchParams.get('action') === 'add-trade';

  const closeManualEntry = useCallback(() => {
    setShowManualEntry(false);
    if (searchParams.get('action') !== 'add-trade') return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('action');
    const query = params.toString();
    router.replace(query ? `/journal?${query}` : '/journal', { scroll: false });
  }, [router, searchParams]);

  // Load the account's summaries (newest-first) and render immediately; open
  // positions are priced separately so the list never waits on the network.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selectedAccountId) {
        setSummaries([]);
        shownAccountRef.current = null;
        return;
      }
      const warm = peekJournalSummaries(selectedAccountId);
      if (warm) {
        setSummaries(warm);
        shownAccountRef.current = selectedAccountId;
      } else if (shownAccountRef.current !== selectedAccountId) {
        setSummaries(null);
      }
      pricedScopeRef.current = '';
      const next = await getJournalSummaries(selectedAccountId);
      if (cancelled) return;
      setSummaries(next);
      shownAccountRef.current = selectedAccountId;
    }
    load();
    return () => { cancelled = true; };
  }, [selectedAccountId, refreshKey]);

  // Price open positions across the loaded days so the index can show an
  // "Unrealized ≈" line. Idempotent via the scope ref so applying prices (which
  // re-renders) can't loop.
  useEffect(() => {
    if (!summaries || summaries.length === 0) return;
    const openSymbols = new Set<string>();
    let minDate = '';
    let maxDate = '';
    for (const day of summaries) {
      for (const trade of day.trades) {
        if (trade.isOpen) {
          openSymbols.add(trade.symbol);
          if (!minDate || day.date < minDate) minDate = day.date;
          if (!maxDate || day.date > maxDate) maxDate = day.date;
        }
      }
    }
    if (openSymbols.size === 0) return;
    const scopeKey = `${[...openSymbols].sort().join(',')}|${minDate}|${maxDate}`;
    if (scopeKey === pricedScopeRef.current) return;
    pricedScopeRef.current = scopeKey;

    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ symbols: [...openSymbols].join(','), from: minDate, to: maxDate });
        const res = await fetch(`/api/quotes?${params}`);
        if (!res.ok || cancelled) return;
        const prices = await res.json();
        applyMarketPrices(summaries, prices);
        setSummaries((prev) => (prev ? [...prev] : prev));
      } catch {
        // Open positions simply won't show unrealized P&L.
      }
    })();
    return () => { cancelled = true; };
  }, [summaries]);

  // Overflow menu dismissal.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  const handleCopyLink = useCallback(async () => {
    const params = new URLSearchParams();
    if (selectedAccountId) params.set('account', selectedAccountId);
    const query = params.toString();
    const url = `${window.location.origin}/journal${query ? `?${query}` : ''}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Journal link copied to clipboard');
    } catch {
      toast.error('Could not copy link');
    }
  }, [selectedAccountId]);

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

  const menuItem = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[14px] text-ink-soft hover:bg-paper-2 hover:text-ink';

  // Loading skeleton.
  if (summaries === null) {
    return (
      <div className="min-h-full bg-paper">
        <div className="mx-auto max-w-[1000px] space-y-3 px-4 py-6 sm:px-7">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-[64px] animate-pulse rounded-xl bg-paper-2" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-full bg-paper font-sans text-ink"
      style={{
        backgroundImage: 'radial-gradient(var(--dot) 1.4px, transparent 1.4px)',
        backgroundSize: '26px 26px',
      }}
    >
      <div className="mx-auto max-w-[1000px] px-4 pb-16 pt-6 sm:px-7">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-hand text-[clamp(1.9rem,4vw,2.6rem)] leading-none text-ink">Trading Journal</h1>
          <div className="flex items-center gap-2">
            <SyncStatusIndicator />
            <FlexSyncControl />
            <button
              type="button"
              onClick={() => (manualEntryVisible ? closeManualEntry() : setShowManualEntry(true))}
              className="inline-flex h-10 items-center gap-1.5 rounded-[12px] bg-ink px-3.5 text-sm font-bold text-paper-card transition hover:opacity-90"
            >
              <Plus size={16} />
              Add Trade
            </button>
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="More actions"
                aria-expanded={menuOpen}
                className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border-2 border-line bg-paper-card text-ink-soft transition hover:text-ink"
              >
                <MoreHorizontal size={18} />
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-[120%] z-30 min-w-[196px] rounded-[14px] border-[2.5px] border-line bg-paper-card p-2"
                  style={{ boxShadow: 'var(--paper-shadow)' }}
                >
                  <button type="button" onClick={() => { setMenuOpen(false); handleCopyLink(); }} className={menuItem}>
                    <Link2 size={16} /> Copy link
                  </button>
                  <Link href="/import" onClick={() => setMenuOpen(false)} className={menuItem}>
                    <Upload size={16} /> Import trades
                  </Link>
                  <button type="button" onClick={() => { setMenuOpen(false); handleLoadSample(); }} disabled={loadingSample} className={menuItem}>
                    <Sparkles size={16} /> {loadingSample ? 'Loading sample…' : 'Load sample data'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {manualEntryVisible && (
          <div className="mt-6">
            <ManualTradePanel
              onClose={closeManualEntry}
              onSaved={() => {
                setRefreshKey((k) => k + 1);
                closeManualEntry();
              }}
            />
          </div>
        )}

        {/* Empty state */}
        {summaries.length === 0 && !manualEntryVisible ? (
          <div className="mt-10 flex flex-col items-center gap-5 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-line bg-paper-card">
              <BookOpen size={30} className="text-ink-soft" />
            </div>
            <div>
              <h2 className="font-hand text-[1.6rem] text-ink">No trades yet</h2>
              <p className="mx-auto mt-1 max-w-sm text-[0.9rem] text-ink-soft">
                Add one manually, load sample data, or import your existing history.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleLoadSample}
                disabled={loadingSample}
                className="inline-flex items-center gap-2 rounded-[12px] bg-ink px-4 py-2.5 text-xs font-bold text-paper-card transition hover:opacity-90 disabled:opacity-50"
              >
                <Sparkles size={15} />
                {loadingSample ? 'Loading sample data…' : 'Load sample trades'}
              </button>
              <Link
                href="/import"
                className="inline-flex items-center gap-2 rounded-[12px] border-2 border-line bg-paper-card px-4 py-2.5 text-xs font-bold text-ink transition hover:bg-paper-2"
              >
                <Upload size={15} />
                Import file
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <PaperJournalList summaries={summaries} currency={currency} />
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { Upload, LayoutDashboard, Calendar, Sparkles, ChevronDown, Check } from 'lucide-react';
import { type DailySummary } from '@/lib/trading/aggregator';
import {
  getJournalSummaries,
  getJournalSummariesSnapshot,
  peekJournalSummaries,
} from '@/lib/trading/journal-summaries-cache';
import { hydrateDayTransactions } from '@/lib/trading/day-summaries-store';
import { onJournalSynced } from '@/lib/journal/sync-bus';
import { computeDashboard } from '@/lib/trading/dashboard';
import { getCashFlows } from '@/lib/db/cash-flows';
import { computeAccountEquity } from '@/lib/trading/cash-flows';
import type { CashFlowRecord } from '@/lib/db/schema';
import { executionInstant, computePnLTimeline } from '@/lib/replay/engine';
import { useDisplayTimezone } from '@/lib/hooks/useDisplayTimezone';
import type { TransactionRecord } from '@/lib/db/schema';
import type { Holding } from '@/lib/trading/portfolio';
import dynamic from 'next/dynamic';
import MonthlyCalendar from '@/components/dashboard/MonthlyCalendar';
import ComparisonBar from '@/components/dashboard/ComparisonBar';
import {
  DashboardWidgetLoading,
  ProgressiveDashboardWidget,
  useProgressiveWidgetReveal,
} from '@/components/dashboard/ProgressiveDashboardWidget';

// Charts pull in recharts (and ReplayTimeline the replay engine), none of which
// the stat tiles or calendar above them need. Load them as separate chunks so
// the initial dashboard paint isn't blocked on parsing them.
const widgetLoader = (label: string) => function DashboardChunkLoading() {
  return <DashboardWidgetLoading label={label} />;
};
const CumulativePnLChart = dynamic(() => import('@/components/dashboard/CumulativePnLChart'), { ssr: false, loading: widgetLoader('cumulative P&L') });
const WinLossDonut = dynamic(() => import('@/components/dashboard/WinLossDonut'), { ssr: false, loading: widgetLoader('win/loss chart') });
const LargestGainLossDonut = dynamic(() => import('@/components/dashboard/LargestGainLossDonut'), { ssr: false, loading: widgetLoader('largest gain and loss') });
const DailyWinLossChart = dynamic(() => import('@/components/dashboard/DailyWinLossChart'), { ssr: false, loading: widgetLoader('daily wins and losses') });
const DailyPnLChart = dynamic(() => import('@/components/dashboard/DailyPnLChart'), { ssr: false, loading: widgetLoader('daily P&L') });
const OpenPositionsCard = dynamic(() => import('@/components/dashboard/OpenPositionsCard'), { ssr: false, loading: widgetLoader('open positions') });
const ReplayTimeline = dynamic(() => import('@/components/replay/ReplayTimeline'), { ssr: false, loading: widgetLoader('latest day activity') });
import { useAccount } from '@/contexts/AccountContext';
import { formatCurrency } from '@/lib/currency';
import { loadDemoSampleData } from '@/lib/import/sample-loader';
import { toast } from 'sonner';
import {
  getDashboardRangePreference,
  setDashboardRangePreference,
  type DashboardRangeType,
} from '@/lib/settings';
import {
  filterDashboardSummaries,
  isDateInDashboardRange,
  resolveDashboardDateRange,
  shiftDashboardRange,
  describeDashboardRange,
  type DashboardDateRange,
} from '@/lib/trading/dashboard-range';
import FlexSyncControl from '@/components/import/ibkr-flex/FlexSyncControl';

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `about ${h} hour${h > 1 ? 's' : ''}`;
  return `about ${h} hour${h > 1 ? 's' : ''} ${m}m`;
}

function dateKeyToInputValue(dateKey: string): string {
  if (dateKey.length !== 8) return '';
  return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
}

interface LatestDayTimeline {
  date: string;
  transactions: TransactionRecord[];
  symbols: string[];
  startTime: number;
  endTime: number;
  snapshots: ReturnType<typeof computePnLTimeline>;
  formattedDate: string;
}

interface DashboardApiResponse {
  accountId: string;
  currency: string;
  initialBalance: number | null;
  range: DashboardDateRange;
  summaries: DailySummary[];
  cashFlows: CashFlowRecord[];
  holdings: Holding[];
}

interface DashboardActivityApiResponse {
  transactions: TransactionRecord[];
}

function buildLatestDayTimeline(
  latest: DailySummary,
  dayTransactions: TransactionRecord[],
): LatestDayTimeline | null {
  // Reversal fills belong to two flat-to-flat trades, so de-duplicate them
  // before building the replay timeline.
  const transactions: TransactionRecord[] = [];
  const seenTransactionIds = new Set<string>();
  for (const transaction of dayTransactions) {
    if (seenTransactionIds.has(transaction.tradeId)) continue;
    seenTransactionIds.add(transaction.tradeId);
    transactions.push(transaction);
  }

  const sorted = transactions.sort(
    (a, b) => executionInstant(a) - executionInstant(b),
  );
  if (sorted.length === 0) return null;

  const times = sorted.map((transaction) => executionInstant(transaction));
  const firstSeenBySymbol = new Map<string, number>();
  for (const transaction of sorted) {
    const timestamp = executionInstant(transaction);
    if (!firstSeenBySymbol.has(transaction.symbol)) {
      firstSeenBySymbol.set(transaction.symbol, timestamp);
    }
  }

  return {
    date: latest.date,
    transactions: sorted,
    symbols: [...firstSeenBySymbol.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([symbol]) => symbol),
    startTime: Math.min(...times) - 300,
    endTime: Math.max(...times) + 300,
    snapshots: computePnLTimeline(sorted),
    formattedDate: latest.formattedDate,
  };
}

export default function DashboardPage() {
  const { accounts, selectedAccountId, setSelectedAccountId } = useAccount();
  const activeAccount = accounts.find(a => a.accountId === selectedAccountId);
  const [serverAccountDetails, setServerAccountDetails] = useState<{
    currency: string;
    initialBalance: number | null;
  } | null>(null);
  const baseCurrency = serverAccountDetails?.currency || activeAccount?.currency || 'USD';
  const initialBalance = serverAccountDetails
    ? serverAccountDetails.initialBalance ?? undefined
    : activeAccount?.initialBalance;
  const displayTimezone = useDisplayTimezone();

  const [rangeType, setRangeType] = useState<DashboardRangeType>('mtd');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [rangePreferenceLoaded, setRangePreferenceLoaded] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    const saved = getDashboardRangePreference();
    const frame = window.requestAnimationFrame(() => {
      setRangeType(saved.rangeType);
      setStartDate(saved.startDate);
      setEndDate(saved.endDate);
      setRangePreferenceLoaded(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!rangePreferenceLoaded) return;
    setDashboardRangePreference({ rangeType, startDate, endDate });
  }, [rangePreferenceLoaded, rangeType, startDate, endDate]);

  const rangeLabel = useMemo(() => {
    switch (rangeType) {
      case '7d': return 'Last 7 Days';
      case '30d': return 'Last 30 Days';
      case 'quarter': return 'This Quarter';
      case 'lastquarter': return 'Last Quarter';
      case 'lastmonth': return 'Last Month';
      case 'mtd': return 'Month to Date';
      case 'ytd': return 'Year to Date';
      case 'month': {
        const d = startDate ? new Date(`${startDate}T00:00:00`) : null;
        return d && !Number.isNaN(d.getTime())
          ? d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          : 'Selected Month';
      }
      case 'custom': {
        const nice = describeDashboardRange({
          start: startDate.replaceAll('-', ''),
          end: endDate.replaceAll('-', ''),
        });
        if (nice) return nice;
        if (startDate && endDate) return `${startDate} to ${endDate}`;
        if (startDate) return `From ${startDate}`;
        if (endDate) return `Until ${endDate}`;
        return 'Custom Range';
      }
      default: return 'Selected Range';
    }
  }, [rangeType, startDate, endDate]);

  const [allSummaries, setAllSummaries] = useState<DailySummary[]>([]);
  const [cashFlows, setCashFlows] = useState<CashFlowRecord[]>([]);
  const [serverHoldings, setServerHoldings] = useState<Holding[] | undefined>(undefined);
  const [empty, setEmpty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dataAccountId, setDataAccountId] = useState<string | null>(null);
  const [dataRequestKey, setDataRequestKey] = useState<string | null>(null);
  const [loadedRange, setLoadedRange] = useState<DashboardDateRange | null>(null);
  const [dataSource, setDataSource] = useState<'server' | 'local' | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [latestDay, setLatestDay] = useState<LatestDayTimeline | null>(null);
  const [latestDayLoading, setLatestDayLoading] = useState(false);

  // Reload the dashboard when a sync merged remote changes into IndexedDB.
  useEffect(() => onJournalSynced(() => setRefreshKey((k) => k + 1)), []);

  // The account whose data is currently on screen. Lets a background
  // revalidation (sync merge) refresh in place instead of flashing the skeleton.
  const shownAccountRef = useRef<string | null>(null);
  const requestKey = `${selectedAccountId ?? ''}:${rangeType}:${startDate}:${endDate}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!rangePreferenceLoaded) return;
      if (!selectedAccountId) {
        setEmpty(true);
        setLoading(false);
        setLoadError(null);
        setDataAccountId(null);
        setDataRequestKey(null);
        setLoadedRange(null);
        setDataSource(null);
        setServerHoldings(undefined);
        setServerAccountDetails(null);
        shownAccountRef.current = null;
        return;
      }

      setLoadError(null);
      try {
        // Signed-in dashboards read the bounded date range directly from the
        // persisted Postgres trade-group model. This avoids syncing or scanning
        // the account's complete execution history before the first metric.
        const params = new URLSearchParams({
          accountId: selectedAccountId,
          rangeType,
        });
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        const response = await fetch(`/api/dashboard?${params}`, { cache: 'no-store' });
        if (response.ok) {
          const dashboard = await response.json() as DashboardApiResponse;
          if (cancelled) return;
          setAllSummaries(dashboard.summaries);
          setCashFlows(dashboard.cashFlows);
          setServerHoldings(dashboard.holdings);
          setServerAccountDetails({
            currency: dashboard.currency,
            initialBalance: dashboard.initialBalance,
          });
          setEmpty(dashboard.summaries.length === 0);
          setLoading(false);
          setDataAccountId(selectedAccountId);
          setDataRequestKey(requestKey);
          setLoadedRange(dashboard.range);
          setDataSource('server');
          shownAccountRef.current = selectedAccountId;

          const latest = dashboard.summaries[0];
          setLatestDay(null);
          setLatestDayLoading(Boolean(latest));
          if (latest) {
            const activityParams = new URLSearchParams({
              accountId: selectedAccountId,
              day: latest.date,
            });
            void fetch(`/api/dashboard/activity?${activityParams}`, { cache: 'no-store' })
              .then(async (activityResponse) => {
                if (!activityResponse.ok) throw new Error('Activity request failed');
                return activityResponse.json() as Promise<DashboardActivityApiResponse>;
              })
              .then((activity) => {
                if (!cancelled) {
                  setLatestDay(buildLatestDayTimeline(latest, activity.transactions));
                }
              })
              .catch(() => {
                if (!cancelled) setLatestDay(null);
              })
              .finally(() => {
                if (!cancelled) setLatestDayLoading(false);
              });
          }
          return;
        }
        // Guests and local-only accounts retain the IndexedDB path. Other
        // server failures are surfaced instead of silently triggering a costly
        // full-history browser rebuild.
        if (response.status !== 401 && response.status !== 404) {
          const payload = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(payload?.error || 'Dashboard data could not be loaded.');
        }

        // Start supplemental account metrics independently. They should update
        // when ready, never hold up the trading widgets above them.
        void getCashFlows(selectedAccountId)
          .then((nextCashFlows) => {
            if (!cancelled) setCashFlows(nextCashFlows);
          })
          .catch(() => {
            if (!cancelled) setCashFlows([]);
          });
        setServerHoldings(undefined);
        setServerAccountDetails(null);

        // Warm memory is synchronous. Otherwise paint any persisted compact
        // snapshot first, even if source changes marked it stale; the local-only
        // authoritative rebuild below replaces it when ready.
        const warm = peekJournalSummaries(selectedAccountId);
        if (warm) {
          setAllSummaries(warm);
          setEmpty(warm.length === 0);
          setLoading(false);
          setDataAccountId(selectedAccountId);
          setDataRequestKey(requestKey);
          setLoadedRange(null);
          setDataSource('local');
          shownAccountRef.current = selectedAccountId;
        } else if (shownAccountRef.current !== selectedAccountId) {
          // Cold load or account switch — nothing trustworthy to show yet.
          setLoading(true);
          setEmpty(false);
        }

        if (!warm) {
          const snapshot = await getJournalSummariesSnapshot(selectedAccountId)
            .catch(() => [] as DailySummary[]);
          if (cancelled) return;
          if (snapshot.length > 0) {
            setAllSummaries(snapshot);
            setEmpty(false);
            setLoading(false);
            setDataAccountId(selectedAccountId);
            setDataRequestKey(requestKey);
            setLoadedRange(null);
            setDataSource('local');
            shownAccountRef.current = selectedAccountId;
          }
        }

        // Authoritative validation/rebuild is local IndexedDB work and happens
        // after the snapshot has already made the dashboard usable.
        const summaries = await getJournalSummaries(selectedAccountId);
        if (cancelled) return;
        setAllSummaries(summaries);
        setEmpty(summaries.length === 0);
        setLoading(false);
        setDataAccountId(selectedAccountId);
        setDataRequestKey(requestKey);
        setLoadedRange(null);
        setDataSource('local');
        shownAccountRef.current = selectedAccountId;
      } catch (error) {
        if (cancelled) return;
        setLoading(false);
        setLoadError(error instanceof Error ? error.message : 'Unable to load dashboard data.');
      }
    }
    load();
    return () => { cancelled = true; };
  }, [endDate, rangePreferenceLoaded, rangeType, refreshKey, requestKey, selectedAccountId, startDate]);

  const filteredData = useMemo(() => {
    if (!allSummaries.length) return null;

    const range = loadedRange ?? resolveDashboardDateRange(
        rangeType,
        allSummaries[0]?.date,
        startDate,
        endDate,
      );
    const filtered = filterDashboardSummaries(allSummaries, range);

    return {
      stats: computeDashboard(filtered),
      summaries: filtered,
      range,
    };
  }, [allSummaries, rangeType, startDate, endDate, loadedRange]);

  // The "Latest Day Activity" replay needs the newest in-range day's raw fills.
  // Load them lazily (the compact summaries carry only trade-level scalars) so
  // the rest of the dashboard renders without waiting on execution data.
  useEffect(() => {
    let active = true;
    (async () => {
      const latest = filteredData?.summaries[0];
      if (dataSource === 'server') return;
      if (!latest) {
        if (active) {
          setLatestDay(null);
          setLatestDayLoading(false);
        }
        return;
      }
      if (active) setLatestDayLoading(true);
      try {
        const dayTransactions = await hydrateDayTransactions(latest);
        if (active) setLatestDay(buildLatestDayTimeline(latest, dayTransactions));
      } catch {
        // Replay is supplemental; summary cards and charts remain usable if
        // execution hydration fails.
        if (active) setLatestDay(null);
      } finally {
        if (active) setLatestDayLoading(false);
      }
    })();
    return () => { active = false; };
  }, [dataSource, filteredData]);

  // Left/right arrows shift the whole dashboard one period at a time, matching
  // the current range's unit (quarter→quarter, 7d→7 days, month→month, …).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (showPicker) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      if (!filteredData || !filteredData.range.start || !filteredData.range.end) return;

      event.preventDefault();
      const next = shiftDashboardRange(
        rangeType,
        filteredData.range,
        event.key === 'ArrowLeft' ? -1 : 1,
      );
      if (!next.startDate) return;
      setRangeType(next.rangeType);
      setStartDate(next.startDate);
      setEndDate(next.endDate);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filteredData, rangeType, showPicker]);

  const hasAccountMetrics = initialBalance != null || (
    shownAccountRef.current === selectedAccountId && cashFlows.length > 0
  );
  const calendarWidgetOrder = hasAccountMetrics ? 8 : 4;
  const dailyWinLossWidgetOrder = calendarWidgetOrder + 1;
  const dailyPnLWidgetOrder = calendarWidgetOrder + 2;
  const cumulativePnLWidgetOrder = calendarWidgetOrder + 3;
  const winLossWidgetOrder = calendarWidgetOrder + 4;
  const holdTimeWidgetOrder = calendarWidgetOrder + 5;
  const averageTradeWidgetOrder = calendarWidgetOrder + 6;
  const largestTradeWidgetOrder = calendarWidgetOrder + 7;
  const openPositionsWidgetOrder = calendarWidgetOrder + 8;
  const latestDayWidgetOrder = calendarWidgetOrder + 9;
  const dataBelongsToSelectedAccount = dataAccountId === selectedAccountId;
  const dataMatchesRequest = dataRequestKey === requestKey;
  const dashboardReady = Boolean(
    !loading && filteredData && selectedAccountId && dataBelongsToSelectedAccount && dataMatchesRequest,
  );
  const visibleWidgetCount = useProgressiveWidgetReveal(
    latestDayWidgetOrder + 1,
    dashboardReady ? requestKey : null,
  );
  const widgetIsVisible = (order: number) => visibleWidgetCount > order;

  if (empty && dataBelongsToSelectedAccount && dataMatchesRequest) {
    return (
      <div className="p-2 sm:p-6 space-y-4 sm:space-y-8 w-full">
        <div>
          <h1 className="hidden sm:block text-2xl sm:text-3xl font-black text-foreground tracking-tight mb-1">Trading Dashboard</h1>
          <p className="text-sm text-muted font-medium">Analyze your performance and trading patterns.</p>
        </div>

        <OpenPositionsCard
          initialHoldings={serverHoldings}
          onTradeAdded={() => setRefreshKey((k) => k + 1)}
        />

        <div className="flex flex-col items-center justify-center py-12 gap-4 text-center border border-dashed border-card-border rounded-2xl bg-card-bg/50">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-muted-bg">
            <LayoutDashboard size={28} className="text-muted" />
          </div>
          <h2 className="text-lg font-bold text-foreground">No historical trades found</h2>
          <p className="text-xs text-muted max-w-sm">
            Import your broker trade history to populate your calendar, analytics, and win-rate charts.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await loadDemoSampleData();
                  setSelectedAccountId(res.accountId);
                  setRefreshKey((k) => k + 1);
                  toast.success(`Loaded ${res.transactionCount} sample IBKR trades!`);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Failed to load sample data.');
                }
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              <Sparkles size={14} />
              Load Sample Trades
            </button>
            <Link
              href="/import"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl border border-card-border bg-card-bg text-foreground hover:bg-sidebar-hover transition-colors"
            >
              <Upload size={14} />
              Import Trades
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loadError && (!dataBelongsToSelectedAccount || !dataMatchesRequest)) {
    return (
      <div className="p-2 sm:p-6 space-y-4 sm:space-y-8 w-full">
        <div>
          <h1 className="hidden sm:block text-2xl sm:text-3xl font-normal text-foreground tracking-tight mb-1">Trading Dashboard</h1>
          <p className="text-sm text-muted font-normal">Analyze your performance and trading patterns.</p>
        </div>
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-card-border bg-card-bg text-center">
          <p className="text-sm font-medium text-foreground">The dashboard could not be loaded.</p>
          <p className="max-w-md text-xs text-muted">{loadError}</p>
          <button
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
            className="rounded-xl bg-accent px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-accent/90"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (loading || !filteredData || !dataBelongsToSelectedAccount || !dataMatchesRequest) {
    return (
      <div className="p-2 sm:p-6 space-y-4 sm:space-y-8 w-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-6">
          <div>
            <h1 className="hidden sm:block text-2xl sm:text-3xl font-normal text-foreground tracking-tight mb-1">Trading Dashboard</h1>
            <p className="text-sm text-muted font-normal">Analyze your performance and trading patterns.</p>
          </div>
          <div className="flex items-center gap-2 self-start md:self-auto">
            <FlexSyncControl />
            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl border border-card-border bg-card-bg/80 text-xs font-normal text-muted shadow-sm">
              <Calendar size={14} className="text-accent" />
              <span>{rangeLabel}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          {['total P&L', 'win rate', 'total trades', 'average trade'].map((label) => (
            <DashboardWidgetLoading key={label} label={label} className="min-h-[6.5rem]" />
          ))}
        </div>
        {hasAccountMetrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
            {['account equity', 'trading return', 'net deposits', 'non-trading income'].map((label) => (
              <DashboardWidgetLoading key={label} label={label} className="min-h-[5.5rem]" />
            ))}
          </div>
        )}
        <DashboardWidgetLoading label="trading calendar" className="min-h-[20rem]" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          <DashboardWidgetLoading label="daily wins and losses" />
          <DashboardWidgetLoading label="daily P&L" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-2 sm:gap-4">
          <DashboardWidgetLoading label="cumulative P&L" className="min-h-[14rem] sm:col-span-2" />
          {['win/loss chart', 'hold time comparison', 'average trade comparison', 'largest gain and loss'].map((label) => (
            <DashboardWidgetLoading key={label} label={label} />
          ))}
        </div>
        <DashboardWidgetLoading label="open positions" />
        <DashboardWidgetLoading label="latest day activity" />
      </div>
    );
  }

  const { stats, summaries, range } = filteredData;
  const periodPnL = summaries.reduce((sum, day) => sum + day.netPnL, 0);
  const periodCashFlows = cashFlows.filter((cashFlow) => isDateInDashboardRange(cashFlow.date, range));
  const equity = computeAccountEquity(initialBalance, periodCashFlows, periodPnL);

  return (
    <div className="p-2 sm:p-6 space-y-4 sm:space-y-8 w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-6">
        <div>
          <h1 className="hidden sm:block text-2xl sm:text-3xl font-normal text-foreground tracking-tight mb-1">Trading Dashboard</h1>
          <p className="text-sm text-muted font-normal">Analyze your performance and trading patterns.</p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <FlexSyncControl />
          {/* Compact Time Range Selector */}
          <div className="relative">
          <button
            type="button"
            onClick={() => setShowPicker((prev) => !prev)}
            className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl border border-card-border bg-card-bg/80 hover:bg-sidebar-hover text-xs font-normal text-foreground transition-all shadow-sm"
          >
            <Calendar size={14} className="text-accent" />
            <span>{rangeLabel}</span>
            <ChevronDown size={14} className={`text-muted transition-transform duration-200 ${showPicker ? 'rotate-180' : ''}`} />
          </button>

          {showPicker && (
            <div className="absolute right-0 top-full mt-2 z-30 w-72 rounded-2xl border border-card-border bg-card-bg p-2.5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="text-[10px] font-normal uppercase tracking-wider text-muted px-2 py-1 mb-1 border-b border-card-border">
                Select Time Range
              </div>
              <div className="grid grid-cols-2 gap-1 py-1">
                {([
                  { id: '7d', label: '7 Days' },
                  { id: '30d', label: '30 Days' },
                  { id: 'quarter', label: 'This Quarter' },
                  { id: 'lastquarter', label: 'Last Quarter' },
                  { id: 'lastmonth', label: 'Last Month' },
                  { id: 'mtd', label: 'Month to Date' },
                  { id: 'ytd', label: 'Year to Date' },
                  { id: 'custom', label: 'Custom' },
                ] satisfies { id: DashboardRangeType; label: string }[]).map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      if (r.id === 'custom' && rangeType !== 'custom') {
                        setStartDate(dateKeyToInputValue(range.start));
                        setEndDate(dateKeyToInputValue(range.end));
                      }
                      setRangeType(r.id);
                      if (r.id !== 'custom') setShowPicker(false);
                    }}
                    className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-normal transition-all ${
                      rangeType === r.id
                        ? 'bg-accent text-white shadow-sm font-normal'
                        : 'text-muted hover:bg-sidebar-hover hover:text-foreground'
                    }`}
                  >
                    <span>{r.label}</span>
                    {rangeType === r.id && <Check size={14} />}
                  </button>
                ))}
              </div>

              {rangeType === 'custom' && (
                <div className="mt-2 pt-2 border-t border-card-border space-y-2 px-1">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-normal text-muted block mb-1">From</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full bg-background border border-card-border rounded-lg px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-normal text-muted block mb-1">To</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full bg-background border border-card-border rounded-lg px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => setShowPicker(false)}
                    className="w-full py-1.5 bg-accent text-white rounded-lg text-xs font-normal hover:bg-accent/90 transition-colors"
                  >
                    Apply Range
                  </button>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Summary Stats Row */}
      {(() => {
        const s = stats;
        const totalPnL = s.cumulativePnL.length > 0 ? s.cumulativePnL[s.cumulativePnL.length - 1].value : 0;
        const totalTrades = s.totalWins + s.totalLosses;
        const avgTrade = totalTrades > 0 ? totalPnL / totalTrades : 0;
        const winRate = totalTrades > 0 ? (s.totalWins / totalTrades) * 100 : 0;

        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted font-normal px-1">
              <span>Showing metrics for <span className="text-foreground font-normal">{rangeLabel}</span></span>
              <span>{summaries.length} trading day{summaries.length === 1 ? '' : 's'}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
              {[
                { label: 'Total P&L', value: totalPnL, prefix: '$', color: totalPnL >= 0 ? 'text-profit' : 'text-loss' },
                { label: 'Win Rate', value: winRate, suffix: '%', color: 'text-accent' },
                { label: 'Total Trades', value: totalTrades, color: 'text-foreground' },
                { label: 'Avg Trade', value: avgTrade, prefix: '$', color: avgTrade >= 0 ? 'text-profit' : 'text-loss' },
              ].map((item, i) => (
                <ProgressiveDashboardWidget
                  key={item.label}
                  visible={widgetIsVisible(i)}
                  label={item.label.toLowerCase()}
                  loadingClassName="min-h-[6.5rem]"
                >
                  <div className="h-full bg-card-bg/50 backdrop-blur-sm border border-card-border p-3 sm:p-5 rounded-2xl shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-normal text-muted uppercase tracking-wider mb-1">{item.label}</p>
                    <p className={`text-2xl sm:text-3xl font-normal tabular-nums ${item.color}`}>
                      {item.value < 0 ? '-' : ''}{item.prefix}{Math.abs(item.value).toLocaleString('en-US', { minimumFractionDigits: item.prefix ? 2 : 0, maximumFractionDigits: item.prefix ? 2 : 1 })}{item.suffix}
                    </p>
                  </div>
                </ProgressiveDashboardWidget>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Cash-flow-aware account stats for the selected dashboard period. */}
      {hasAccountMetrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          {[
            { label: 'Account Equity', value: formatCurrency(equity.equity, baseCurrency), color: 'text-foreground' },
            {
              label: 'Trading Return',
              value: equity.tradingReturnPct != null ? `${equity.tradingReturnPct.toFixed(2)}%` : '—',
              color: equity.tradingReturnPct != null && equity.tradingReturnPct < 0 ? 'text-loss' : 'text-profit',
            },
            { label: 'Net Deposits', value: formatCurrency(equity.contributions, baseCurrency), color: 'text-foreground' },
            { label: 'Non-Trading Income', value: formatCurrency(equity.nonTradingIncome, baseCurrency), color: 'text-foreground' },
          ].map((item, i) => (
            <ProgressiveDashboardWidget
              key={item.label}
              visible={widgetIsVisible(i + 4)}
              label={item.label.toLowerCase()}
              loadingClassName="min-h-[5.5rem]"
            >
              <div className="h-full bg-card-bg/50 backdrop-blur-sm border border-card-border p-3 sm:p-4 rounded-2xl shadow-sm">
                <p className="text-[10px] font-normal text-muted uppercase tracking-wider mb-1">{item.label}</p>
                <p className={`text-lg sm:text-xl font-normal tabular-nums ${item.color}`}>{item.value}</p>
              </div>
            </ProgressiveDashboardWidget>
          ))}
        </div>
      )}

      <ProgressiveDashboardWidget
        visible={widgetIsVisible(calendarWidgetOrder)}
        label="trading calendar"
        loadingClassName="min-h-[20rem]"
      >
        <MonthlyCalendar
          summaries={allSummaries}
          rangeStart={range.start}
          rangeEnd={range.end}
          onMonthChange={(monthStart) => {
            // Calendar navigation drives the stats: recompute everything for the
            // month now showing in the calendar.
            setRangeType('month');
            setStartDate(monthStart);
            setEndDate('');
          }}
        />
      </ProgressiveDashboardWidget>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 items-stretch">
        <ProgressiveDashboardWidget visible={widgetIsVisible(dailyWinLossWidgetOrder)} label="daily wins and losses">
          <DailyWinLossChart summaries={summaries} />
        </ProgressiveDashboardWidget>
        <ProgressiveDashboardWidget visible={widgetIsVisible(dailyPnLWidgetOrder)} label="daily P&L">
          <DailyPnLChart summaries={summaries} currency={baseCurrency} />
        </ProgressiveDashboardWidget>
      </div>

      {/* Chart + metric cards. One row on xl screens (chart spans 2 of 6);
          folds to a full-width chart with 2×2 cards on small screens. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-2 sm:gap-4 items-stretch">
        <ProgressiveDashboardWidget
          visible={widgetIsVisible(cumulativePnLWidgetOrder)}
          label="cumulative P&L"
          className="sm:col-span-2 h-full"
        >
          <CumulativePnLChart
            data={stats.cumulativePnL}
            initialBalance={equity.capitalBase > 0 ? equity.capitalBase : initialBalance}
          />
        </ProgressiveDashboardWidget>
        <ProgressiveDashboardWidget visible={widgetIsVisible(winLossWidgetOrder)} label="win/loss chart">
          <WinLossDonut
            wins={stats.totalWins}
            losses={stats.totalLosses}
            title="Winning vs Losing Trades"
          />
        </ProgressiveDashboardWidget>
        <ProgressiveDashboardWidget visible={widgetIsVisible(holdTimeWidgetOrder)} label="hold time comparison">
          <ComparisonBar
            title="Hold Time Winning vs Losing Trades"
            winLabel="Winning"
            winValue={stats.avgWinHoldMinutes}
            lossLabel="Losing"
            lossValue={stats.avgLossHoldMinutes}
            formatValue={(v) => formatMinutes(Math.abs(v))}
          />
        </ProgressiveDashboardWidget>
        <ProgressiveDashboardWidget visible={widgetIsVisible(averageTradeWidgetOrder)} label="average trade comparison">
          <ComparisonBar
            title="Average Winning Trade vs Losing Trade"
            winLabel="Avg Win"
            winValue={stats.avgWin}
            lossLabel="Avg Loss"
            lossValue={stats.avgLoss}
            formatValue={(v) => formatCurrency(v, baseCurrency)}
          />
        </ProgressiveDashboardWidget>
        <ProgressiveDashboardWidget visible={widgetIsVisible(largestTradeWidgetOrder)} label="largest gain and loss">
          <LargestGainLossDonut gain={stats.largestGain} loss={stats.largestLoss} currency={baseCurrency} />
        </ProgressiveDashboardWidget>
      </div>

      {/* Open Positions & Manual Entry Card */}
      <ProgressiveDashboardWidget visible={widgetIsVisible(openPositionsWidgetOrder)} label="open positions">
        <OpenPositionsCard
          initialHoldings={serverHoldings}
          onTradeAdded={() => setRefreshKey((k) => k + 1)}
        />
      </ProgressiveDashboardWidget>

      {!widgetIsVisible(latestDayWidgetOrder) ? (
        <DashboardWidgetLoading label="latest day activity" />
      ) : latestDayLoading ? (
        <DashboardWidgetLoading label="latest day activity" />
      ) : latestDay && latestDay.date === summaries[0]?.date ? (
        <div className="rounded-xl border border-card-border bg-card-bg p-5 shadow-sm">
          <h3 className="text-sm font-normal text-foreground mb-3 flex items-center gap-2">
            <Calendar size={14} className="text-accent" />
            Latest Day Activity — {latestDay.formattedDate}
          </h3>
          <ReplayTimeline
            transactions={latestDay.transactions}
            symbols={latestDay.symbols}
            currentTimeSeconds={latestDay.endTime}
            startTimeSeconds={latestDay.startTime}
            endTimeSeconds={latestDay.endTime}
            snapshots={latestDay.snapshots}
            timeZone={displayTimezone}
          />
        </div>
      ) : null}
    </div>
  );
}

'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Upload, LayoutDashboard, Calendar, Sparkles, ChevronDown, Check } from 'lucide-react';
import { type DailySummary } from '@/lib/trading/aggregator';
import { getJournalSummaries, peekJournalSummaries } from '@/lib/trading/journal-summaries-cache';
import { onJournalSynced } from '@/lib/journal/sync-bus';
import { computeDashboard } from '@/lib/trading/dashboard';
import { getCashFlows } from '@/lib/db/cash-flows';
import { computeAccountEquity } from '@/lib/trading/cash-flows';
import type { CashFlowRecord } from '@/lib/db/schema';
import { timeToSeconds, computePnLTimeline } from '@/lib/replay/engine';
import type { TransactionRecord } from '@/lib/db/schema';
import MonthlyCalendar from '@/components/dashboard/MonthlyCalendar';
import CumulativePnLChart from '@/components/dashboard/CumulativePnLChart';
import WinLossDonut from '@/components/dashboard/WinLossDonut';
import ComparisonBar from '@/components/dashboard/ComparisonBar';
import LargestGainLossDonut from '@/components/dashboard/LargestGainLossDonut';
import DailyWinLossChart from '@/components/dashboard/DailyWinLossChart';
import DailyPnLChart from '@/components/dashboard/DailyPnLChart';
import ReplayTimeline from '@/components/replay/ReplayTimeline';
import OpenPositionsCard from '@/components/dashboard/OpenPositionsCard';
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
  transactions: TransactionRecord[];
  symbols: string[];
  startTime: number;
  endTime: number;
  snapshots: ReturnType<typeof computePnLTimeline>;
  formattedDate: string;
}

function buildLatestDayTimeline(summaries: DailySummary[]): LatestDayTimeline | null {
  const latest = summaries[0]; // summaries are sorted newest first
  if (!latest) return null;

  // Reversal fills belong to two flat-to-flat trades, so de-duplicate them
  // before building the replay timeline.
  const transactions: TransactionRecord[] = [];
  const seenTransactionIds = new Set<string>();
  for (const trade of latest.trades) {
    for (const transaction of trade.transactions) {
      if (seenTransactionIds.has(transaction.tradeId)) continue;
      seenTransactionIds.add(transaction.tradeId);
      transactions.push(transaction);
    }
  }

  const sorted = transactions.sort(
    (a, b) => timeToSeconds(a.time) - timeToSeconds(b.time),
  );
  if (sorted.length === 0) return null;

  const times = sorted.map((transaction) => timeToSeconds(transaction.time));
  const firstSeenBySymbol = new Map<string, number>();
  for (const transaction of sorted) {
    const timestamp = timeToSeconds(transaction.time);
    if (!firstSeenBySymbol.has(transaction.symbol)) {
      firstSeenBySymbol.set(transaction.symbol, timestamp);
    }
  }

  return {
    transactions: sorted,
    symbols: [...firstSeenBySymbol.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([symbol]) => symbol),
    startTime: Math.max(0, Math.min(...times) - 300),
    endTime: Math.min(86400, Math.max(...times) + 300),
    snapshots: computePnLTimeline(sorted),
    formattedDate: latest.formattedDate,
  };
}

export default function DashboardPage() {
  const { accounts, selectedAccountId, setSelectedAccountId } = useAccount();
  const activeAccount = accounts.find(a => a.accountId === selectedAccountId);
  const baseCurrency = activeAccount?.currency || 'USD';

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
      case 'custom':
        if (startDate && endDate) return `${startDate} to ${endDate}`;
        if (startDate) return `From ${startDate}`;
        if (endDate) return `Until ${endDate}`;
        return 'Custom Range';
      default: return 'Selected Range';
    }
  }, [rangeType, startDate, endDate]);

  const [allSummaries, setAllSummaries] = useState<DailySummary[]>([]);
  const [cashFlows, setCashFlows] = useState<CashFlowRecord[]>([]);
  const [empty, setEmpty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Reload the dashboard when a sync merged remote changes into IndexedDB.
  useEffect(() => onJournalSynced(() => setRefreshKey((k) => k + 1)), []);

  useEffect(() => {
    async function load() {
      if (!selectedAccountId) {
        setEmpty(true);
        setLoading(false);
        return;
      }

      // Warm cache (shared with the journal): skip the skeleton when the
      // aggregation is already built, so navigating in is instant.
      const warm = peekJournalSummaries(selectedAccountId);
      if (warm) {
        setAllSummaries(warm);
        setEmpty(warm.length === 0);
        setLoading(false);
      } else {
        setLoading(true);
        setEmpty(false);
      }

      const [cashFlowsData, summaries] = await Promise.all([
        getCashFlows(selectedAccountId),
        getJournalSummaries(selectedAccountId),
      ]);
      setCashFlows(cashFlowsData);
      setAllSummaries(summaries);
      setEmpty(summaries.length === 0);
      setLoading(false);
    }
    load();
  }, [selectedAccountId, refreshKey]);

  const filteredData = useMemo(() => {
    if (!allSummaries.length) return null;

    const range = resolveDashboardDateRange(
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
  }, [allSummaries, rangeType, startDate, endDate]);

  if (empty) {
    return (
      <div className="p-2 sm:p-6 space-y-4 sm:space-y-8 w-full">
        <div>
          <h1 className="hidden sm:block text-2xl sm:text-3xl font-black text-foreground tracking-tight mb-1">Trading Dashboard</h1>
          <p className="text-sm text-muted font-medium">Analyze your performance and trading patterns.</p>
        </div>

        <OpenPositionsCard onTradeAdded={() => setRefreshKey((k) => k + 1)} />

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

  if (loading || !filteredData) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-32 rounded-xl bg-card-bg border border-card-border animate-pulse" />
        <div className="h-80 rounded-xl bg-card-bg border border-card-border animate-pulse" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-56 rounded-xl bg-card-bg border border-card-border animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const { stats, summaries, range } = filteredData;
  const periodPnL = summaries.reduce((sum, day) => sum + day.netPnL, 0);
  const periodCashFlows = cashFlows.filter((cashFlow) => isDateInDashboardRange(cashFlow.date, range));
  const equity = computeAccountEquity(activeAccount?.initialBalance, periodCashFlows, periodPnL);
  const latestDay = buildLatestDayTimeline(summaries);

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
                <div key={i} className="bg-card-bg/50 backdrop-blur-sm border border-card-border p-3 sm:p-5 rounded-2xl shadow-sm hover:shadow-md transition-all">
                  <p className="text-xs font-normal text-muted uppercase tracking-wider mb-1">{item.label}</p>
                  <p className={`text-2xl sm:text-3xl font-normal tabular-nums ${item.color}`}>
                    {item.prefix}{Math.abs(item.value).toLocaleString('en-US', { minimumFractionDigits: item.prefix ? 2 : 0, maximumFractionDigits: item.prefix ? 2 : 1 })}{item.suffix}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Cash-flow-aware account stats for the selected dashboard period. */}
      {(activeAccount?.initialBalance != null || cashFlows.length > 0) && (
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
            <div key={i} className="bg-card-bg/50 backdrop-blur-sm border border-card-border p-3 sm:p-4 rounded-2xl shadow-sm">
              <p className="text-[10px] font-normal text-muted uppercase tracking-wider mb-1">{item.label}</p>
              <p className={`text-lg sm:text-xl font-normal tabular-nums ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>
      )}

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 items-stretch">
        <DailyWinLossChart summaries={summaries} />
        <DailyPnLChart summaries={summaries} currency={baseCurrency} />
      </div>

      {/* Chart + metric cards. One row on xl screens (chart spans 2 of 6);
          folds to a full-width chart with 2×2 cards on small screens. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-2 sm:gap-4 items-stretch">
        <div className="sm:col-span-2 h-full">
          <CumulativePnLChart
            data={stats.cumulativePnL}
            initialBalance={equity.capitalBase > 0 ? equity.capitalBase : activeAccount?.initialBalance}
          />
        </div>
        <WinLossDonut
          wins={stats.totalWins}
          losses={stats.totalLosses}
          title="Winning vs Losing Trades"
        />
        <ComparisonBar
          title="Hold Time Winning vs Losing Trades"
          winLabel="Winning"
          winValue={stats.avgWinHoldMinutes}
          lossLabel="Losing"
          lossValue={stats.avgLossHoldMinutes}
          formatValue={(v) => formatMinutes(Math.abs(v))}
        />
        <ComparisonBar
          title="Average Winning Trade vs Losing Trade"
          winLabel="Avg Win"
          winValue={stats.avgWin}
          lossLabel="Avg Loss"
          lossValue={stats.avgLoss}
          formatValue={(v) => formatCurrency(v, baseCurrency)}
        />
        <LargestGainLossDonut gain={stats.largestGain} loss={stats.largestLoss} currency={baseCurrency} />
      </div>

      {/* Open Positions & Manual Entry Card */}
      <OpenPositionsCard onTradeAdded={() => setRefreshKey((k) => k + 1)} />

      {latestDay && (
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
          />
        </div>
      )}
    </div>
  );
}

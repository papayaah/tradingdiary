'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Upload, LayoutDashboard } from 'lucide-react';
import { getAllTransactions } from '@/lib/db/trades';
import { getTradeDateCutoff } from '@/lib/settings';
import { aggregateByDay, type DailySummary } from '@/lib/trading/aggregator';
import { computeDashboard, type DashboardData } from '@/lib/trading/dashboard';
import { timeToSeconds, computePnLTimeline } from '@/lib/replay/engine';
import type { TransactionRecord } from '@/lib/db/schema';
import MonthlyCalendar from '@/components/dashboard/MonthlyCalendar';
import CumulativePnLChart from '@/components/dashboard/CumulativePnLChart';
import WinLossDonut from '@/components/dashboard/WinLossDonut';
import ComparisonBar from '@/components/dashboard/ComparisonBar';
import LargestGainLossDonut from '@/components/dashboard/LargestGainLossDonut';
import ReplayTimeline from '@/components/replay/ReplayTimeline';
import { useAccount } from '@/contexts/AccountContext';
import { getTransactionsByAccount } from '@/lib/db/trades';
import { formatCurrency } from '@/lib/currency';

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `about ${h} hour${h > 1 ? 's' : ''}`;
  return `about ${h} hour${h > 1 ? 's' : ''} ${m}m`;
}

interface LatestDayTimeline {
  transactions: TransactionRecord[];
  symbols: string[];
  startTime: number;
  endTime: number;
  snapshots: ReturnType<typeof computePnLTimeline>;
  formattedDate: string;
}

export default function DashboardPage() {
  const { accounts, selectedAccountId } = useAccount();
  const activeAccount = accounts.find(a => a.accountId === selectedAccountId);
  const baseCurrency = activeAccount?.currency || 'USD';

  const [data, setData] = useState<DashboardData | null>(null);
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [latestDay, setLatestDay] = useState<LatestDayTimeline | null>(null);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    async function load() {
      if (!selectedAccountId) {
        setEmpty(true);
        return;
      }

      setData(null);
      setLatestDay(null);
      setEmpty(false);

      const transactions = await getTransactionsByAccount(selectedAccountId);
      if (transactions.length === 0) {
        setEmpty(true);
        return;
      }
      const agg = aggregateByDay(transactions, getTradeDateCutoff());
      setSummaries(agg);
      setData(computeDashboard(agg));

      // Build timeline data for the most recent day
      if (agg.length > 0) {
        const latest = agg[0]; // sorted desc by date
        const dayTxns: TransactionRecord[] = [];
        for (const trade of latest.trades) {
          dayTxns.push(...trade.transactions);
        }
        const sorted = dayTxns.sort(
          (a, b) => timeToSeconds(a.time) - timeToSeconds(b.time)
        );
        if (sorted.length > 0) {
          const times = sorted.map((t) => timeToSeconds(t.time));
          const min = Math.min(...times);
          const max = Math.max(...times);
          const seen = new Map<string, number>();
          for (const t of sorted) {
            const ts = timeToSeconds(t.time);
            if (!seen.has(t.symbol) || ts < seen.get(t.symbol)!) {
              seen.set(t.symbol, ts);
            }
          }
          const symbols = [...seen.entries()]
            .sort((a, b) => a[1] - b[1])
            .map(([sym]) => sym);

          setLatestDay({
            transactions: sorted,
            symbols,
            startTime: Math.max(0, min - 300),
            endTime: Math.min(86400, max + 300),
            snapshots: computePnLTimeline(sorted),
            formattedDate: latest.formattedDate,
          });
        }
      }
    }
    load();
  }, [selectedAccountId]);

  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full gap-4 text-center p-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted-bg">
          <LayoutDashboard size={32} className="text-muted" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">No trading data</h2>
        <p className="text-sm text-muted max-w-sm">
          Import your trading data to see dashboard analytics.
        </p>
        <Link
          href="/import"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
        >
          <Upload size={16} />
          Import Trades
        </Link>
      </div>
    );
  }

  if (!data) {
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

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
      </div>

      <MonthlyCalendar summaries={summaries} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <CumulativePnLChart data={data.cumulativePnL} />
        </div>
        <WinLossDonut
          wins={data.totalWins}
          losses={data.totalLosses}
          title="Winning vs Losing Trades"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ComparisonBar
          title="Hold Time Winning vs Losing Trades"
          winLabel="Winning"
          winValue={data.avgWinHoldMinutes}
          lossLabel="Losing"
          lossValue={data.avgLossHoldMinutes}
          formatValue={(v) => formatMinutes(Math.abs(v))}
        />
        <ComparisonBar
          title="Average Winning Trade vs Losing Trade"
          winLabel="Avg Win"
          winValue={data.avgWin}
          lossLabel="Avg Loss"
          lossValue={data.avgLoss}
          formatValue={(v) => formatCurrency(v, baseCurrency)}
        />
        <LargestGainLossDonut gain={data.largestGain} loss={data.largestLoss} currency={baseCurrency} />
      </div>

      {latestDay && (
        <div className="rounded-xl border border-card-border bg-card-bg p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Latest Day Activity — {latestDay.formattedDate}
          </h3>
          <ReplayTimeline
            transactions={latestDay.transactions}
            symbols={latestDay.symbols}
            currentTimeSeconds={latestDay.endTime}
            startTimeSeconds={latestDay.startTime}
            endTimeSeconds={latestDay.endTime}
            snapshots={latestDay.snapshots}
            prevVisibleCount={latestDay.transactions.length}
          />
        </div>
      )}
    </div>
  );
}

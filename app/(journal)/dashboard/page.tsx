'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Upload, LayoutDashboard } from 'lucide-react';
import { getAllTransactions } from '@/lib/db/trades';
import { aggregateByDay } from '@/lib/trading/aggregator';
import { computeDashboard, type DashboardData } from '@/lib/trading/dashboard';
import CalendarStrip from '@/components/dashboard/CalendarStrip';
import CumulativePnLChart from '@/components/dashboard/CumulativePnLChart';
import WinLossDonut from '@/components/dashboard/WinLossDonut';
import ComparisonBar from '@/components/dashboard/ComparisonBar';
import LargestGainLossDonut from '@/components/dashboard/LargestGainLossDonut';

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `about ${h} hour${h > 1 ? 's' : ''}`;
  return `about ${h} hour${h > 1 ? 's' : ''} ${m}m`;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    async function load() {
      const transactions = await getAllTransactions();
      if (transactions.length === 0) {
        setEmpty(true);
        return;
      }
      const summaries = aggregateByDay(transactions);
      setData(computeDashboard(summaries));
    }
    load();
  }, []);

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

  const monthLabel = data.calendar.length > 0
    ? (() => {
        const d = data.calendar.find((c) => c.hasData) ?? data.calendar[0];
        const date = new Date(
          parseInt(d.date.substring(0, 4)),
          parseInt(d.date.substring(4, 6)) - 1,
          parseInt(d.date.substring(6, 8))
        );
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      })()
    : '';

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
      </div>

      <CalendarStrip days={data.calendar} monthLabel={monthLabel} />

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
          formatValue={(v) => `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <LargestGainLossDonut gain={data.largestGain} loss={data.largestLoss} />
      </div>
    </div>
  );
}

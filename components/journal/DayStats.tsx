'use client';

import { Lock } from 'lucide-react';
import type { DailySummary } from '@/lib/trading/aggregator';
import { formatVolume, pnlColorClass } from '@/lib/utils/format';
import { formatCurrency } from '@/lib/currency';

interface DayStatsProps {
  summary: DailySummary;
  currency?: string;
}

interface StatCardProps {
  label: string;
  value?: string;
  locked?: boolean;
  colorClass?: string;
}

function StatCard({ label, value, locked, colorClass }: StatCardProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      {locked ? (
        <Lock size={14} className="text-muted" />
      ) : (
        <span className={`text-sm font-semibold ${colorClass || 'text-foreground'}`}>
          {value}
        </span>
      )}
    </div>
  );
}

export default function DayStats({ summary, currency = 'USD' }: DayStatsProps) {
  const winPct = summary.winCount + summary.lossCount > 0
    ? ((summary.winCount / (summary.winCount + summary.lossCount)) * 100).toFixed(0) + '%'
    : '-';

  const totalUnrealized = summary.trades.reduce(
    (sum, t) => sum + (t.unrealizedPnL ?? 0), 0
  );
  const hasUnrealized = summary.trades.some((t) => t.unrealizedPnL != null);
  const combinedPnL = summary.netPnL + totalUnrealized;

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-4 px-5 py-4 bg-card-bg border-b border-card-border">
      <StatCard label="Total Trades" value={summary.totalTrades.toString()} />
      <StatCard label="Total Volume" value={formatVolume(summary.totalVolume)} />
      <StatCard label="Win %" value={winPct} />
      <StatCard
        label="Commissions/Fees"
        value={formatCurrency(summary.totalCommissions, currency)}
        colorClass="text-loss"
      />
      <StatCard
        label="Realized P&L"
        value={formatCurrency(summary.netPnL, currency)}
        colorClass={pnlColorClass(summary.netPnL)}
      />
      {summary.totalPnL !== summary.netPnL ? (
        <StatCard
          label="Total P&L (Inc. Unrealized)"
          value={formatCurrency(summary.totalPnL, currency)}
          colorClass={pnlColorClass(summary.totalPnL)}
        />
      ) : (
        <StatCard label="MFE/MAE Ratio" locked />
      )}
    </div>
  );
}

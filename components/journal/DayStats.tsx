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
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-bold text-muted uppercase tracking-wider">{label}</span>
      {locked ? (
        <Lock size={12} className="text-muted/40" />
      ) : (
        <span className={`text-[13px] font-black ${colorClass || 'text-foreground'}`}>
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

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-x-8 gap-y-3 px-6 py-3 bg-card-bg border-b border-card-border">
      <StatCard label="Total Trades" value={summary.totalTrades.toString()} />
      <StatCard label="Total Volume" value={formatVolume(summary.totalVolume)} />
      <StatCard label="Win %" value={winPct} />
      <StatCard
        label="Commissions"
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
          label="Total (Inc. Unrl)"
          value={formatCurrency(summary.totalPnL, currency)}
          colorClass={pnlColorClass(summary.totalPnL)}
        />
      ) : (
        <StatCard label="MFE/MAE Ratio" locked />
      )}
    </div>
  );
}

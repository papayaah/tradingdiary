'use client';

import { Lock } from 'lucide-react';
import type { DailySummary } from '@/lib/trading/aggregator';
import { formatCurrency, formatVolume, pnlColorClass } from '@/lib/utils/format';

interface DayStatsProps {
  summary: DailySummary;
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

export default function DayStats({ summary }: DayStatsProps) {
  const winPct = summary.winCount + summary.lossCount > 0
    ? ((summary.winCount / (summary.winCount + summary.lossCount)) * 100).toFixed(0) + '%'
    : '-';

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-4 px-5 py-4 bg-card-bg border-b border-card-border">
      <StatCard label="Total Trades" value={summary.totalTrades.toString()} />
      <StatCard label="Total Volume" value={formatVolume(summary.totalVolume)} />
      <StatCard label="Win %" value={winPct} />
      <StatCard label="MFE/MAE Ratio" locked />
      <StatCard
        label="Commissions/Fees"
        value={formatCurrency(summary.totalCommissions)}
        colorClass="text-loss"
      />
      <StatCard
        label="Net P&L"
        value={formatCurrency(summary.netPnL)}
        colorClass={pnlColorClass(summary.netPnL)}
      />
    </div>
  );
}

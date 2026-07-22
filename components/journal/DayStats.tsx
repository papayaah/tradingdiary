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
    <div className="flex flex-col gap-1 px-4 py-2 bg-muted-bg/30 rounded-xl border border-card-border/30 hover:bg-muted-bg/50 transition-colors">
      <span className="text-[10px] font-bold text-muted uppercase tracking-widest">{label}</span>
      {locked ? (
        <div className="flex items-center gap-1.5 h-6">
          <Lock size={12} className="text-muted/50" />
          <span className="text-xs font-medium text-muted/50 font-mono italic">Locked</span>
        </div>
      ) : (
        <span className={`text-sm font-black ${colorClass || 'text-foreground'} tabular-nums`}>
          {value}
        </span>
      )}
    </div>
  );
}

export default function DayStats({ summary, currency = 'USD' }: DayStatsProps) {
  const totalTrades = summary.winCount + summary.lossCount;
  const winPctRaw = totalTrades > 0 ? (summary.winCount / totalTrades) * 100 : 0;
  const winPct = totalTrades > 0 ? winPctRaw.toFixed(0) + '%' : '-';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 px-6 py-5 bg-card-bg/40 border-b border-card-border/50">
      <StatCard label="Total Trades" value={summary.totalTrades.toString()} />
      <StatCard label="Total Volume" value={formatVolume(summary.totalVolume)} />
      <StatCard
        label="Win rate"
        value={winPct}
        colorClass={winPctRaw >= 50 ? 'text-profit' : winPctRaw > 0 ? 'text-loss' : 'text-muted'}
      />
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
          label="Total (Incl. Unrl)"
          value={formatCurrency(summary.totalPnL, currency)}
          colorClass={pnlColorClass(summary.totalPnL)}
        />
      ) : (
        <StatCard label="Adv. Metrics" locked />
      )}
    </div>
  );
}


'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import type { DailySummary } from '@/lib/trading/aggregator';
import { formatCurrency } from '@/lib/currency';

interface DailyPnLChartProps {
  summaries: DailySummary[];
  currency?: string;
}

function dayLabel(date: string): string {
  if (!date || date.length < 8) return date;
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

function CustomTooltip({ active, payload, currency }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const isProfit = p.pnl >= 0;
  return (
    <div className="rounded-xl border border-white/10 bg-card-bg/80 backdrop-blur-md px-3 py-2 shadow-2xl">
      <div className="flex items-center gap-2 mb-1 border-b border-card-border/50 pb-1">
        <div className={`w-2 h-2 rounded-full ${isProfit ? 'bg-profit' : 'bg-loss'}`} />
        <p className="text-[10px] font-bold text-muted uppercase tracking-wider">{p.label}</p>
      </div>
      <p className={`text-sm font-black ${isProfit ? 'text-profit' : 'text-loss'}`}>
        {formatCurrency(p.pnl, currency)}
      </p>
    </div>
  );
}

export default function DailyPnLChart({ summaries, currency = 'USD' }: DailyPnLChartProps) {
  const data = [...summaries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({ date: s.date, label: dayLabel(s.date), pnl: s.netPnL }));

  return (
    <div className="h-full flex flex-col rounded-2xl border border-card-border bg-card-bg/50 backdrop-blur-sm p-4 shadow-sm hover:shadow-md transition-all duration-300">
      <h3 className="text-xs font-bold text-muted uppercase tracking-widest mb-4">Daily P&amp;L</h3>
      <div className="h-[200px] w-full flex-1 min-h-[200px]">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="var(--card-border)" vertical={false} opacity={0.4} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'var(--muted)', fontWeight: 500 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--card-border)' }}
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--muted)', fontWeight: 500 }}
                tickLine={false}
                axisLine={false}
                width={50}
                tickFormatter={(v: number) =>
                  Math.abs(v) >= 1000 ? `${v < 0 ? '-' : ''}$${Math.abs(v / 1000).toFixed(0)}k` : `$${v}`
                }
              />
              <ReferenceLine y={0} stroke="var(--card-border)" />
              <Tooltip
                content={(props) => <CustomTooltip {...props} currency={currency} />}
                cursor={{ fill: 'var(--muted)', fillOpacity: 0.08 }}
              />
              <Bar dataKey="pnl" radius={[2, 2, 0, 0]} animationDuration={900} animationEasing="ease-out">
                {data.map((d, i) => (
                  <Cell key={i} fill={d.pnl >= 0 ? 'var(--profit)' : 'var(--loss)'} fillOpacity={0.9} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center">
            <span className="text-xs font-bold text-muted uppercase tracking-tighter">No data</span>
          </div>
        )}
      </div>
    </div>
  );
}

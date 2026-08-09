'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { DailySummary } from '@/lib/trading/aggregator';

interface DailyWinLossChartProps {
  summaries: DailySummary[];
}

function dayLabel(date: string): string {
  if (!date || date.length < 8) return date;
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border border-white/10 bg-card-bg/80 backdrop-blur-md px-3 py-2 shadow-2xl">
      <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1 border-b border-card-border/50 pb-1">
        {p.label}
      </p>
      <div className="flex items-center gap-2 text-sm font-black">
        <span className="text-profit">{p.wins}W</span>
        <span className="text-muted">/</span>
        <span className="text-loss">{p.losses}L</span>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center justify-center gap-4 mb-1">
      <span className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-wider">
        <span className="w-2 h-2 rounded-full bg-profit" /> Wins
      </span>
      <span className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-wider">
        <span className="w-2 h-2 rounded-full bg-loss" /> Losses
      </span>
    </div>
  );
}

export default function DailyWinLossChart({ summaries }: DailyWinLossChartProps) {
  const data = [...summaries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({ date: s.date, label: dayLabel(s.date), wins: s.winCount, losses: s.lossCount }));

  return (
    <div className="h-full flex flex-col rounded-2xl border border-card-border bg-card-bg/50 backdrop-blur-sm p-4 shadow-sm hover:shadow-md transition-all duration-300">
      <h3 className="text-xs font-bold text-muted uppercase tracking-widest mb-4">Daily Wins/Losses</h3>
      <div className="w-full flex-1 min-h-[200px] flex flex-col">
        {data.length > 0 ? (
          <>
            <Legend />
            <div className="flex-1 min-h-0">
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
                    width={30}
                    allowDecimals={false}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--muted)', fillOpacity: 0.08 }} />
                  <Bar dataKey="wins" stackId="wl" fill="var(--profit)" fillOpacity={0.9} animationDuration={900} animationEasing="ease-out" />
                  <Bar dataKey="losses" stackId="wl" fill="var(--loss)" fillOpacity={0.9} radius={[2, 2, 0, 0]} animationDuration={900} animationEasing="ease-out" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center">
            <span className="text-xs font-bold text-muted uppercase tracking-tighter">No data</span>
          </div>
        )}
      </div>
    </div>
  );
}

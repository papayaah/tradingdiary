'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { CumulativePnLPoint } from '@/lib/trading/dashboard';

interface CumulativePnLChartProps {
  data: CumulativePnLPoint[];
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: CumulativePnLPoint }> }) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  const point = payload[0].payload;
  const isProfit = val >= 0;

  return (
    <div className="rounded-xl border border-white/10 bg-card-bg/80 backdrop-blur-md px-4 py-3 shadow-2xl animate-in fade-in zoom-in duration-200">
      <div className="flex items-center gap-2 mb-1.5 border-b border-card-border/50 pb-1.5">
        <div className={`w-2 h-2 rounded-full ${isProfit ? 'bg-profit' : 'bg-loss'} shadow-[0_0_8px_rgba(0,0,0,0.1)]`} />
        <p className="text-[10px] font-bold text-muted uppercase tracking-wider">{point.label}</p>
      </div>
      <p className={`text-base font-black ${isProfit ? 'text-profit' : 'text-loss'}`}>
        {val < 0 ? '-' : '+'}${Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  );
}

export default function CumulativePnLChart({ data }: CumulativePnLChartProps) {
  const maxVal = Math.max(...data.map((d) => d.value), 0);
  const minVal = Math.min(...data.map((d) => d.value), 0);
  const totalPnL = data.length > 0 ? data[data.length - 1].value : 0;
  const isProfit = totalPnL >= 0;

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg/50 backdrop-blur-sm p-6 shadow-sm hover:shadow-md transition-all duration-300">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-sm font-bold text-muted uppercase tracking-widest mb-1">Cumulative P&L</h3>
          <p className={`text-2xl font-black ${isProfit ? 'text-profit' : 'text-loss'}`}>
            {totalPnL < 0 ? '-' : '+'}${Math.abs(totalPnL).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className={`px-3 py-1 rounded-full text-[10px] font-bold ${isProfit ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'} border ${isProfit ? 'border-profit/20' : 'border-loss/20'}`}>
          {isProfit ? 'Trending Up' : 'Trending Down'}
        </div>
      </div>

      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isProfit ? "var(--profit)" : "var(--loss)"} stopOpacity={0.2} />
                <stop offset="95%" stopColor={isProfit ? "var(--profit)" : "var(--loss)"} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="4 4"
              stroke="var(--card-border)"
              vertical={false}
              opacity={0.4}
            />
            <XAxis
              dataKey="label"
              hide={true}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--muted)', fontWeight: 500 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                `$${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toLocaleString()}`
              }
              domain={[
                Math.floor(minVal / 100) * 100 - 100,
                Math.ceil(maxVal / 100) * 100 + 100
              ]}
              orientation="right"
              width={45}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: 'var(--accent)', strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={isProfit ? "var(--profit)" : "var(--loss)"}
              strokeWidth={3}
              fill="url(#pnlGradient)"
              animationDuration={1500}
              animationEasing="ease-out"
              activeDot={{ r: 6, stroke: 'var(--card-bg)', strokeWidth: 2, fill: isProfit ? 'var(--profit)' : 'var(--loss)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

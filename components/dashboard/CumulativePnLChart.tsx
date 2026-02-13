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
  return (
    <div className="rounded-lg border border-card-border bg-card-bg px-3 py-2 shadow-lg">
      <p className="text-xs text-muted">{point.label}</p>
      <p className={`text-sm font-bold ${val >= 0 ? 'text-profit' : 'text-loss'}`}>
        {val < 0 ? '-' : ''}${Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  );
}

export default function CumulativePnLChart({ data }: CumulativePnLChartProps) {
  const maxVal = Math.max(...data.map((d) => d.value), 0);
  const minVal = Math.min(...data.map((d) => d.value), 0);

  return (
    <div className="rounded-xl border border-card-border bg-card-bg p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">Cumulative P&L</h3>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <defs>
              <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--profit)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--profit)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--card-border)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--card-border)' }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--muted)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                `$${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toLocaleString()}`
              }
              domain={[Math.floor(minVal / 500) * 500, Math.ceil(maxVal / 500) * 500]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--profit)"
              strokeWidth={2.5}
              fill="url(#pnlGradient)"
              animationDuration={1200}
              animationEasing="ease-in-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

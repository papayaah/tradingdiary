'use client';

import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { formatCurrency } from '@/lib/currency';

interface LargestGainLossDonutProps {
  gain: number;
  loss: number;
  currency?: string;
}

export default function LargestGainLossDonut({ gain, loss, currency = 'USD' }: LargestGainLossDonutProps) {
  const absGain = Math.abs(gain);
  const absLoss = Math.abs(loss);
  const total = absGain + absLoss;
  const data = [
    { name: 'Gain', value: absGain },
    { name: 'Loss', value: absLoss },
  ];

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg/50 backdrop-blur-sm p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
      <h3 className="text-[10px] font-bold text-muted uppercase tracking-widest mb-6 border-b border-card-border/50 pb-2">Largest Gain vs Loss</h3>
      <div className="flex-1 flex items-center justify-center">
        {total > 0 ? (
          <div className="relative w-[180px] h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={78}
                  paddingAngle={6}
                  dataKey="value"
                  animationDuration={1200}
                  animationEasing="ease-out"
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                  <Cell fill="var(--profit)" fillOpacity={0.9} />
                  <Cell fill="var(--loss)" fillOpacity={0.9} />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] font-black text-muted uppercase tracking-tighter mb-1">Spread</span>
              <span className="text-xl font-black text-foreground">
                {formatCurrency(total, currency)}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8">
            <div className="w-12 h-12 rounded-full bg-muted-bg/30 flex items-center justify-center border border-dashed border-card-border">
              <span className="text-muted text-xs">?</span>
            </div>
            <span className="text-xs font-bold text-muted uppercase tracking-tighter">No data</span>
          </div>
        )}
      </div>
      {total > 0 && (
        <div className="flex justify-center gap-6 mt-6 pt-4 border-t border-card-border/30">
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">Largest Gain</span>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-profit shadow-[0_0_8px_rgba(22,163,74,0.4)]" />
              <span className="text-sm font-black text-foreground">{formatCurrency(absGain, currency)}</span>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">Largest Loss</span>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-loss shadow-[0_0_8px_rgba(220,38,38,0.4)]" />
              <span className="text-sm font-black text-foreground">{formatCurrency(-absLoss, currency)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

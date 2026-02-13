'use client';

import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface LargestGainLossDonutProps {
  gain: number;
  loss: number;
}

export default function LargestGainLossDonut({ gain, loss }: LargestGainLossDonutProps) {
  const absGain = Math.abs(gain);
  const absLoss = Math.abs(loss);
  const total = absGain + absLoss;
  const data = [
    { name: 'Gain', value: absGain },
    { name: 'Loss', value: absLoss },
  ];

  return (
    <div className="rounded-xl border border-card-border bg-card-bg p-5 flex flex-col">
      <h3 className="text-sm font-semibold text-foreground mb-3">Largest Gain vs Largest Loss</h3>
      <div className="flex-1 flex items-center justify-center">
        {total > 0 ? (
          <div className="relative w-[160px] h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={72}
                  paddingAngle={3}
                  dataKey="value"
                  animationDuration={800}
                  animationEasing="ease-out"
                  startAngle={90}
                  endAngle={-270}
                >
                  <Cell fill="var(--profit)" />
                  <Cell fill="var(--loss)" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <span className="text-sm text-muted">No data</span>
        )}
      </div>
      {total > 0 && (
        <div className="flex justify-center gap-4 mt-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-profit" />
            <span className="text-muted">
              ${absGain.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-loss" />
            <span className="text-muted">
              -${absLoss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

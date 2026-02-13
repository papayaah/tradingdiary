'use client';

import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface WinLossDonutProps {
  wins: number;
  losses: number;
  title: string;
}

export default function WinLossDonut({ wins, losses, title }: WinLossDonutProps) {
  const total = wins + losses;
  const data = [
    { name: 'Wins', value: wins },
    { name: 'Losses', value: losses },
  ];

  return (
    <div className="rounded-xl border border-card-border bg-card-bg p-5 flex flex-col">
      <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>
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
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold text-foreground">{total}</span>
              <span className="text-[10px] text-muted">trades</span>
            </div>
          </div>
        ) : (
          <span className="text-sm text-muted">No data</span>
        )}
      </div>
      {total > 0 && (
        <div className="flex justify-center gap-4 mt-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-profit" />
            <span className="text-muted">{wins} wins</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-loss" />
            <span className="text-muted">{losses} losses</span>
          </div>
        </div>
      )}
    </div>
  );
}

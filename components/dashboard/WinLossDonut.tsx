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
    <div className="h-full rounded-2xl border border-card-border bg-card-bg/50 backdrop-blur-sm p-4 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
      <h3 className="text-xs font-normal text-muted uppercase tracking-wider mb-3 border-b border-card-border/50 pb-2">{title}</h3>
      <div className="flex-1 flex items-center justify-center">
        {total > 0 ? (
          <div className="relative w-[140px] h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={44}
                  outerRadius={62}
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
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-normal text-foreground tabular-nums">{total}</span>
              <span className="text-[9px] uppercase font-normal text-muted tracking-wider">Trades</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8">
            <div className="w-12 h-12 rounded-full bg-muted-bg/30 flex items-center justify-center border border-dashed border-card-border">
              <span className="text-muted text-xs">?</span>
            </div>
            <span className="text-xs font-normal text-muted uppercase tracking-tighter">No data</span>
          </div>
        )}
      </div>
      {total > 0 && (
        <div className="flex justify-center gap-4 mt-3 pt-3 border-t border-card-border/30">
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-normal text-muted uppercase tracking-wider mb-1">Wins</span>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-profit shadow-[0_0_8px_rgba(22,163,74,0.4)]" />
              <span className="text-sm font-normal text-foreground tabular-nums">{wins}</span>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-normal text-muted uppercase tracking-wider mb-1">Losses</span>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-loss shadow-[0_0_8px_rgba(220,38,38,0.4)]" />
              <span className="text-sm font-normal text-foreground tabular-nums">{losses}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

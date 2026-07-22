'use client';

import type { PositionInfo } from '@/lib/replay/engine';
import { pnlColorClass, formatVolume } from '@/lib/utils/format';
import { useAccount } from '@/contexts/AccountContext';
import { formatCurrency } from '@/lib/currency';

interface ReplayStatsProps {
  netPnL: number;
  visibleCount: number;
  totalCount: number;
  positions: PositionInfo[];
  currentTime: string; // "HH:MM:SS"
}

export default function ReplayStats({
  netPnL,
  visibleCount,
  totalCount,
  positions,
  currentTime,
}: ReplayStatsProps) {
  const { accounts, selectedAccountId } = useAccount();
  const activeAccount = accounts.find(a => a.accountId === selectedAccountId);
  const currency = activeAccount?.currency || 'USD';

  const timeDisplay = formatTimeAmPm(currentTime);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard label="Net P&L">
        <span
          className={`text-2xl font-black transition-colors duration-200 tracking-tight ${pnlColorClass(netPnL)} drop-shadow-sm`}
        >
          {formatCurrency(netPnL, currency)}
        </span>
      </StatCard>

      <StatCard label="Progress">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-black text-foreground tracking-tight">
            {visibleCount}
          </span>
          <span className="text-[10px] font-bold text-muted uppercase tracking-widest">/ {totalCount} trades</span>
        </div>
      </StatCard>

      <StatCard label="Positions">
        {positions.length === 0 ? (
          <div className="flex items-center gap-2 h-8">
            <div className="w-1.5 h-1.5 rounded-full bg-muted/40" />
            <span className="text-xs font-bold text-muted uppercase tracking-tighter">All Flat</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1 max-h-[48px] overflow-y-auto pr-1 custom-scrollbar">
            {positions.slice(0, 3).map((p) => (
              <div key={p.symbol} className="flex items-center justify-between text-[11px] font-bold">
                <span className="text-foreground uppercase tracking-tight">{p.symbol}</span>{' '}
                <span className={`px-1.5 rounded-md ${p.side === 'LONG' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'}`}>
                  {formatVolume(p.qty)}
                </span>
              </div>
            ))}
            {positions.length > 3 && (
              <span className="text-[9px] font-bold text-muted italic text-right">+{positions.length - 3} more</span>
            )}
          </div>
        )}
      </StatCard>

      <StatCard label="Current Time">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-mono font-black text-foreground tracking-tight text-accent drop-shadow-sm">
            {timeDisplay}
          </span>
        </div>
      </StatCard>
    </div>
  );
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="group rounded-2xl border border-card-border/50 bg-card-bg/50 backdrop-blur-sm px-6 py-4 min-h-[100px] flex flex-col justify-between hover:border-card-border transition-all hover:shadow-md">
      <span className="text-[10px] font-bold text-muted uppercase tracking-widest bg-muted-bg/50 px-2 py-1 rounded-lg w-fit group-hover:bg-muted-bg group-hover:text-foreground transition-colors">{label}</span>
      <div className="mt-2 overflow-hidden">{children}</div>
    </div>
  );
}

function formatTimeAmPm(time: string): string {
  const [hStr, mStr] = time.split(':');
  let h = parseInt(hStr);
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr} ${ampm}`;
}

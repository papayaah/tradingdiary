'use client';

import type { PositionInfo } from '@/lib/replay/engine';
import { pnlColorClass, formatCurrency, formatVolume } from '@/lib/utils/format';

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
  const timeDisplay = formatTimeAmPm(currentTime);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard label="Net P&L">
        <span
          className={`text-lg font-bold transition-colors duration-200 ${pnlColorClass(netPnL)}`}
        >
          {formatCurrency(netPnL)}
        </span>
      </StatCard>

      <StatCard label="Trades Executed">
        <span className="text-lg font-bold text-foreground">
          {visibleCount}
          <span className="text-sm font-normal text-muted"> / {totalCount}</span>
        </span>
      </StatCard>

      <StatCard label="Open Positions">
        {positions.length === 0 ? (
          <span className="text-sm text-muted">All flat</span>
        ) : (
          <div className="flex flex-col gap-0.5">
            {positions.slice(0, 3).map((p) => (
              <span key={p.symbol} className="text-xs text-foreground">
                <span className="font-medium">{p.symbol}</span>{' '}
                <span className={p.side === 'LONG' ? 'text-profit' : 'text-loss'}>
                  {formatVolume(p.qty)} {p.side}
                </span>
              </span>
            ))}
            {positions.length > 3 && (
              <span className="text-xs text-muted">+{positions.length - 3} more</span>
            )}
          </div>
        )}
      </StatCard>

      <StatCard label="Time">
        <span className="text-lg font-bold text-foreground">{timeDisplay}</span>
      </StatCard>
    </div>
  );
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-card-border bg-card-bg px-5 py-4 h-[88px]">
      <span className="text-xs text-muted">{label}</span>
      <div className="mt-1 overflow-hidden">{children}</div>
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

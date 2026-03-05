'use client';

import { formatCurrency, pnlColorClass } from '@/lib/utils/format';

interface DayHeaderProps {
  formattedDate: string;
  totalPnL: number;
}

export default function DayHeader({ formattedDate, totalPnL }: DayHeaderProps) {
  return (
    <div className="flex items-center justify-between px-5 py-3 bg-card-bg border-b border-card-border rounded-t-xl">
      <h2 className="text-base font-semibold text-foreground">{formattedDate}</h2>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted font-medium uppercase tracking-wide">Total P&L:</span>
        <span className={`text-sm font-bold ${pnlColorClass(totalPnL)}`}>
          {totalPnL < 0 ? '-' : ''}${Math.abs(totalPnL).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  );
}

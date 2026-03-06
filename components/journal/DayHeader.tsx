'use client';

import { pnlColorClass } from '@/lib/utils/format';
import { formatCurrency } from '@/lib/currency';

interface DayHeaderProps {
  formattedDate: string;
  totalPnL: number;
  currency?: string;
}

export default function DayHeader({ formattedDate, totalPnL, currency = 'USD' }: DayHeaderProps) {
  return (
    <div className="flex items-center justify-between px-5 py-3 bg-card-bg border-b border-card-border rounded-t-xl">
      <h2 className="text-base font-semibold text-foreground">{formattedDate}</h2>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted font-medium uppercase tracking-wide">Total P&L:</span>
        <span className={`text-sm font-bold ${pnlColorClass(totalPnL)}`}>
          {formatCurrency(totalPnL, currency)}
        </span>
      </div>
    </div>
  );
}

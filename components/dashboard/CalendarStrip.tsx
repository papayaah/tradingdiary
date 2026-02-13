'use client';

import type { CalendarDay } from '@/lib/trading/dashboard';
import { pnlColorClass } from '@/lib/utils/format';

interface CalendarStripProps {
  days: CalendarDay[];
  monthLabel: string;
}

export default function CalendarStrip({ days, monthLabel }: CalendarStripProps) {
  return (
    <div className="rounded-xl border border-card-border bg-card-bg p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">{monthLabel}</h3>
      <div className="grid grid-cols-7 gap-3">
        {days.map((day) => (
          <div
            key={day.date}
            className="rounded-lg border border-card-border bg-background p-3 min-h-[90px] flex flex-col justify-between"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold text-foreground">{day.dayNum}</span>
              <span className="text-xs text-muted">{day.dayName}</span>
            </div>
            <div className="mt-auto">
              {day.hasData ? (
                <>
                  <div className={`text-sm font-bold ${pnlColorClass(day.pnl)}`}>
                    {day.pnl < 0 ? '-' : ''}${Math.abs(day.pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-muted">{day.tradeCount} trades</div>
                </>
              ) : (
                <>
                  <div className="text-sm font-bold text-muted">$0</div>
                  <div className="text-xs text-muted">0 trades</div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

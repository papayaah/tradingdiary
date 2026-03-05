'use client';

import { useState, useMemo, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DailySummary } from '@/lib/trading/aggregator';
import { pnlColorClass } from '@/lib/utils/format';

interface MonthlyCalendarProps {
  summaries: DailySummary[];
}

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatPnLShort(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}$${k.toFixed(k >= 100 ? 0 : k >= 10 ? 1 : 2)}K`;
  }
  return `${sign}$${abs.toFixed(0)}`;
}

interface DayData {
  pnl: number;
  tradeCount: number;
  winRate: number;
}

export default function MonthlyCalendar({ summaries }: MonthlyCalendarProps) {
  const router = useRouter();
  // Determine initial month from data (most recent)
  const defaultMonth = useMemo(() => {
    if (summaries.length === 0) return new Date();
    const latest = summaries[0].date; // sorted desc
    return new Date(
      parseInt(latest.substring(0, 4)),
      parseInt(latest.substring(4, 6)) - 1,
      1
    );
  }, [summaries]);

  const [viewMonth, setViewMonth] = useState(defaultMonth);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  // Build lookup from summaries
  const dataByDate = useMemo(() => {
    const map = new Map<string, DayData>();
    for (const s of summaries) {
      map.set(s.date, {
        pnl: s.totalPnL,
        tradeCount: s.totalTrades,
        winRate: s.winRate,
      });
    }
    return map;
  }, [summaries]);

  // Build calendar grid
  const { weeks, monthStats } = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const startDow = firstDay.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Grid starts from the Sunday of the first week
    const gridStart = new Date(year, month, 1 - startDow);

    const weeks: { days: GridDay[]; weekPnL: number; weekDays: number }[] = [];
    let totalPnL = 0;
    let totalDays = 0;
    let currentDate = new Date(gridStart);

    // Build 5-6 weeks to cover the full month
    while (true) {
      const week: GridDay[] = [];
      let weekPnL = 0;
      let weekDays = 0;

      for (let d = 0; d < 7; d++) {
        const dateStr = `${currentDate.getFullYear()}${String(currentDate.getMonth() + 1).padStart(2, '0')}${String(currentDate.getDate()).padStart(2, '0')}`;
        const isCurrentMonth = currentDate.getMonth() === month;
        const data = dataByDate.get(dateStr);

        week.push({
          date: dateStr,
          dayNum: currentDate.getDate(),
          isCurrentMonth,
          data: data ?? null,
        });

        if (data && isCurrentMonth) {
          weekPnL += data.pnl;
          weekDays++;
          totalPnL += data.pnl;
          totalDays++;
        }

        currentDate = new Date(currentDate);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      weeks.push({ days: week, weekPnL, weekDays });

      // Stop if we've passed the end of the month
      if (currentDate.getMonth() !== month && currentDate.getDate() > 1) break;
      // Safety: max 6 weeks
      if (weeks.length >= 6) break;
    }

    return { weeks, monthStats: { totalPnL, totalDays } };
  }, [year, month, dataByDate]);

  const monthLabel = viewMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const goToThisMonth = () => {
    const now = new Date();
    setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const prevMonth = () => setViewMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setViewMonth(new Date(year, month + 1, 1));

  return (
    <div className="rounded-xl border border-card-border bg-card-bg p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-sidebar-hover transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <h3 className="text-base font-semibold text-foreground min-w-[160px] text-center">
            {monthLabel}
          </h3>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-sidebar-hover transition-colors"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={goToThisMonth}
            className="ml-2 px-2.5 py-1 text-xs rounded-md border border-card-border text-muted hover:text-foreground hover:bg-sidebar-hover transition-colors"
          >
            This month
          </button>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted">Monthly stats:</span>
          <span
            className={`font-bold px-2 py-0.5 rounded ${monthStats.totalPnL > 0
              ? 'bg-profit/15 text-profit'
              : monthStats.totalPnL < 0
                ? 'bg-loss/15 text-loss'
                : 'text-muted'
              }`}
          >
            {formatPnLShort(monthStats.totalPnL)}
          </span>
          <span className="text-muted">
            {monthStats.totalDays} day{monthStats.totalDays !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-[repeat(7,1fr)_auto] gap-px bg-card-border rounded-lg overflow-hidden">
        {/* Day headers */}
        {DAY_HEADERS.map((day) => (
          <div
            key={day}
            className="bg-table-header-bg px-2 py-2 text-center text-xs font-medium text-muted uppercase"
          >
            {day}
          </div>
        ))}
        {/* Week summary header */}
        <div className="bg-table-header-bg px-3 py-2 text-center text-xs font-medium text-muted uppercase">
          Week
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <Fragment key={`wf-${wi}`}>
            {week.days.map((day) => (
              <DayCell
                key={day.date}
                day={day}
                onClick={() => router.push(`/journal?date=${day.date}`)}
              />
            ))}
            <WeekSummary
              key={`w${wi}`}
              weekNum={wi + 1}
              pnl={week.weekPnL}
              days={week.weekDays}
            />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

interface GridDay {
  date: string;
  dayNum: number;
  isCurrentMonth: boolean;
  data: DayData | null;
}

function DayCell({ day, onClick }: { day: GridDay; onClick?: () => void }) {
  if (!day.isCurrentMonth) {
    return <div className="bg-background min-h-[90px] p-2 opacity-30" />;
  }

  const hasData = day.data !== null;
  const pnl = day.data?.pnl ?? 0;

  let bgClass = 'bg-card-bg';
  if (hasData) {
    bgClass = pnl > 0 ? 'bg-profit/10 hover:bg-profit/20' : pnl < 0 ? 'bg-loss/10 hover:bg-loss/20' : 'bg-card-bg hover:bg-sidebar-hover';
  } else {
    bgClass = 'bg-card-bg hover:bg-sidebar-hover';
  }

  return (
    <div
      onClick={onClick}
      className={`${bgClass} min-h-[90px] p-2 flex flex-col cursor-pointer transition-colors group`}
    >
      <span className="text-xs text-muted self-end group-hover:text-foreground">{day.dayNum}</span>
      {hasData && (
        <div className="flex-1 flex flex-col items-center justify-center gap-0.5">
          <span className={`text-sm font-bold ${pnlColorClass(pnl)}`}>
            {formatPnLShort(pnl)}
          </span>
          <span className="text-[10px] text-muted">
            {day.data!.tradeCount} trade{day.data!.tradeCount !== 1 ? 's' : ''}
          </span>
          <span className="text-[10px] text-muted">
            {day.data!.winRate.toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
}

function WeekSummary({
  weekNum,
  pnl,
  days,
}: {
  weekNum: number;
  pnl: number;
  days: number;
}) {
  return (
    <div className="bg-card-bg min-h-[90px] px-3 py-2 flex flex-col items-center justify-center w-[90px]">
      <span className="text-[10px] text-muted">Week {weekNum}</span>
      <span className={`text-sm font-bold ${pnlColorClass(pnl)}`}>
        {days > 0 ? formatPnLShort(pnl) : '$0'}
      </span>
      <span className="text-[10px] text-accent">
        {days} day{days !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

'use client';

import { useState, useMemo, Fragment, useEffect } from 'react';
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

  // Sync viewMonth when data changes significantly (e.g. range selection)
  useEffect(() => {
    setViewMonth(defaultMonth);
  }, [defaultMonth]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  const rangeStats = useMemo(() => {
    let totalPnL = 0;
    let totalDays = 0;
    for (const s of summaries) {
      totalPnL += s.totalPnL;
      totalDays++;
    }
    return { totalPnL, totalDays };
  }, [summaries]);

  // Determine which months to show. 
  // If the summaries span across 1-4 months, we show all of them.
  // Otherwise we show the single month navigation view.
  const monthsToShow = useMemo(() => {
    if (summaries.length === 0) return [viewMonth];

    const sortedDates = [...summaries].map(s => s.date).sort();
    const firstDateStr = sortedDates[0];
    const lastDateStr = sortedDates[sortedDates.length - 1];

    const startMonth = new Date(parseInt(firstDateStr.substring(0, 4)), parseInt(firstDateStr.substring(4, 6)) - 1, 1);
    const endMonth = new Date(parseInt(lastDateStr.substring(0, 4)), parseInt(lastDateStr.substring(4, 6)) - 1, 1);

    const months: Date[] = [];
    let cur = new Date(startMonth);
    while (cur <= endMonth) {
      months.push(new Date(cur));
      cur.setMonth(cur.getMonth() + 1);
      if (months.length > 5) break; // Limit to 5 to avoid explosion
    }

    if (months.length > 0 && months.length <= 4) {
      return months.reverse(); // Newest first
    }
    return [viewMonth];
  }, [summaries, viewMonth]);

  const isMultiMonth = monthsToShow.length > 1;

  const goToThisMonth = () => {
    const now = new Date();
    setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const prevMonth = () => setViewMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setViewMonth(new Date(year, month + 1, 1));

  return (
    <div className="space-y-4">
      {/* Global Header */}
      <div className="rounded-xl border border-card-border bg-card-bg p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {!isMultiMonth && (
              <div className="flex items-center gap-1 mr-2">
                <button
                  onClick={prevMonth}
                  className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-sidebar-hover transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={nextMonth}
                  className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-sidebar-hover transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
            <h3 className="text-lg font-bold text-foreground">
              {isMultiMonth ? (
                <span className="flex items-center gap-2">
                  <span className="text-accent underline underline-offset-4 decoration-2">Range View</span>
                  <span className="text-muted text-sm font-medium">({monthsToShow.length} months)</span>
                </span>
              ) : (
                viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              )}
            </h3>
            {!isMultiMonth && (
              <button
                onClick={goToThisMonth}
                className="ml-2 px-2.5 py-1 text-xs font-semibold rounded-lg border border-card-border text-muted hover:text-foreground hover:bg-sidebar-hover transition-all"
              >
                Go to Today
              </button>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm bg-muted-bg/50 px-4 py-2 rounded-xl border border-card-border/50">
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase font-bold text-muted tracking-wider">Net Range P&L</span>
              <span className={`font-bold text-lg leading-tight ${pnlColorClass(rangeStats.totalPnL)}`}>
                {formatPnLShort(rangeStats.totalPnL)}
              </span>
            </div>
            <div className="w-px h-8 bg-card-border" />
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-muted tracking-wider">Active Days</span>
              <span className="font-bold text-lg leading-tight text-foreground">
                {rangeStats.totalDays}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Month Grids */}
      <div className="space-y-6">
        {monthsToShow.map((dt) => (
          <div key={dt.toISOString()} className="rounded-xl border border-card-border bg-card-bg p-5 shadow-sm">
            {isMultiMonth && (
              <div className="mb-4 pb-2 border-b border-card-border flex items-center justify-between">
                <h4 className="font-bold text-foreground">
                  {dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </h4>
              </div>
            )}
            <MonthView
              year={dt.getFullYear()}
              month={dt.getMonth()}
              dataByDate={dataByDate}
              onDayClick={(date) => router.push(`/journal?date=${date}`)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

interface MonthViewProps {
  year: number;
  month: number;
  dataByDate: Map<string, DayData>;
  onDayClick: (date: string) => void;
}

function MonthView({ year, month, dataByDate, onDayClick }: MonthViewProps) {
  const weeks = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const startDow = firstDay.getDay();
    const gridStart = new Date(year, month, 1 - startDow);
    const weeks: { days: GridDay[]; weekPnL: number; weekDays: number }[] = [];
    let currentDate = new Date(gridStart);

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
        }
        currentDate = new Date(currentDate);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      weeks.push({ days: week, weekPnL, weekDays });
      if (currentDate.getMonth() !== month && currentDate.getDate() > 1) break;
      if (weeks.length >= 6) break;
    }
    return weeks;
  }, [year, month, dataByDate]);

  return (
    <div className="grid grid-cols-[repeat(7,1fr)_auto] gap-px bg-card-border rounded-lg overflow-hidden border border-card-border shadow-inner">
      {DAY_HEADERS.map((day) => (
        <div key={day} className="bg-table-header-bg px-2 py-2 text-center text-[10px] font-bold text-muted uppercase tracking-widest">
          {day}
        </div>
      ))}
      <div className="bg-table-header-bg px-3 py-2 text-center text-[10px] font-bold text-muted uppercase tracking-widest">
        Week
      </div>

      {weeks.map((week, wi) => (
        <Fragment key={`wf-${wi}`}>
          {week.days.map((day) => (
            <DayCell
              key={day.date}
              day={day}
              onClick={() => onDayClick(day.date)}
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

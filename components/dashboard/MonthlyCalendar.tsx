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

  // If a range is selected that spans 2-4 months, we show a single contiguous grid
  const rangeInfo = useMemo(() => {
    if (summaries.length === 0) return null;

    const sortedByDateAsc = [...summaries].map(s => s.date).sort();
    const firstStr = sortedByDateAsc[0];
    const lastStr = sortedByDateAsc[sortedByDateAsc.length - 1];

    const d1 = new Date(parseInt(firstStr.substring(0, 4)), parseInt(firstStr.substring(4, 6)) - 1, parseInt(firstStr.substring(6, 8)));
    const d2 = new Date(parseInt(lastStr.substring(0, 4)), parseInt(lastStr.substring(4, 6)) - 1, parseInt(lastStr.substring(6, 8)));

    // Calculate months span
    const monthsSpan = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()) + 1;

    // We only use the contiguous view if it spans 2-4 months or is specifically a short range.
    // If it's more, stick to single month view with nav.
    if (monthsSpan > 1 && monthsSpan <= 4) {
      return { firstDate: d1, lastDate: d2, span: monthsSpan };
    }
    return null;
  }, [summaries]);

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
            {!rangeInfo && (
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
              {rangeInfo ? (
                <span className="flex items-center gap-2">
                  <span className="text-accent underline underline-offset-4 decoration-2">Contiguous View</span>
                  <span className="text-muted text-sm font-medium">({rangeInfo.span} months)</span>
                </span>
              ) : (
                viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              )}
            </h3>
            {!rangeInfo && (
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

      <div className="rounded-xl border border-card-border bg-card-bg p-5 shadow-sm">
        {rangeInfo ? (
          <ContiguousRangeView
            startDate={rangeInfo.firstDate}
            endDate={rangeInfo.lastDate}
            dataByDate={dataByDate}
            onDayClick={(date) => router.push(`/journal?date=${date}`)}
          />
        ) : (
          <MonthView
            year={year}
            month={month}
            dataByDate={dataByDate}
            onDayClick={(date) => router.push(`/journal?date=${date}`)}
          />
        )}
      </div>
    </div>
  );
}

interface ContiguousRangeViewProps {
  startDate: Date;
  endDate: Date;
  dataByDate: Map<string, DayData>;
  onDayClick: (date: string) => void;
}

function ContiguousRangeView({ startDate, endDate, dataByDate, onDayClick }: ContiguousRangeViewProps) {
  const weeks = useMemo(() => {
    // Start from the Sunday of the week containing the start date
    const gridStart = new Date(startDate);
    gridStart.setDate(startDate.getDate() - startDate.getDay());

    const weeks: { days: GridDay[]; weekPnL: number; weekDays: number }[] = [];
    let currentDate = new Date(gridStart);

    // Keep adding weeks until we pass the end date
    while (currentDate <= endDate || currentDate.getDay() !== 0) {
      const week: GridDay[] = [];
      let weekPnL = 0;
      let weekDays = 0;

      for (let d = 0; d < 7; d++) {
        const dateStr = `${currentDate.getFullYear()}${String(currentDate.getMonth() + 1).padStart(2, '0')}${String(currentDate.getDate()).padStart(2, '0')}`;
        const data = dataByDate.get(dateStr);

        week.push({
          date: dateStr,
          dayNum: currentDate.getDate(),
          isCurrentMonth: true, // Always true for contiguous view as we only show relevant range
          isFirstOfMonth: currentDate.getDate() === 1,
          monthName: currentDate.toLocaleDateString('en-US', { month: 'short' }),
          data: data ?? null,
        });

        if (data) {
          weekPnL += data.pnl;
          weekDays++;
        }
        currentDate = new Date(currentDate);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      weeks.push({ days: week, weekPnL, weekDays });

      // If we finished a week and we've passed the end date, stop.
      if (currentDate > endDate) break;
      if (weeks.length > 20) break; // Safety
    }
    return weeks;
  }, [startDate, endDate, dataByDate]);

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
              showMonthLabel={day.isFirstOfMonth}
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
          isFirstOfMonth: false,
          monthName: '',
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
  isFirstOfMonth: boolean;
  monthName: string;
  data: DayData | null;
}

function DayCell({ day, showMonthLabel, onClick }: { day: GridDay; showMonthLabel?: boolean; onClick?: () => void }) {
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
      className={`${bgClass} min-h-[95px] p-2 flex flex-col cursor-pointer transition-colors group relative`}
    >
      <div className="flex justify-between items-start">
        {showMonthLabel && (
          <span className="text-[10px] font-black uppercase text-accent bg-accent/10 px-1 rounded">
            {day.monthName}
          </span>
        )}
        <span className="text-xs text-muted ml-auto group-hover:text-foreground font-medium">{day.dayNum}</span>
      </div>

      {hasData && (
        <div className="flex-1 flex flex-col items-center justify-center gap-0.5 mt-1">
          <span className={`text-sm font-bold ${pnlColorClass(pnl)}`}>
            {formatPnLShort(pnl)}
          </span>
          <div className="flex flex-col items-center leading-tight">
            <span className="text-[9px] text-muted opacity-80">
              {day.data!.tradeCount} trades
            </span>
            <span className="text-[9px] text-muted font-bold">
              {day.data!.winRate.toFixed(0)}%
            </span>
          </div>
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

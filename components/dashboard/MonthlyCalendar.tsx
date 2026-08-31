'use client';

import { useState, useMemo, Fragment, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { DailySummary } from '@/lib/trading/aggregator';
import { pnlColorClass } from '@/lib/utils/format';

interface MonthlyCalendarProps {
  /** Trade summaries inside the dashboard's currently selected period. */
  summaries: DailySummary[];
  /** Selected date-range bounds ('YYYYMMDD'). */
  rangeStart?: string;
  rangeEnd?: string;
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

function formatDayLabel(d: string): string {
  if (d.length !== 8) return d;
  const dt = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00`);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MonthlyCalendar({ summaries, rangeStart = '', rangeEnd = '' }: MonthlyCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selectedSummary = useMemo(
    () => (selectedDate ? summaries.find((s) => s.date === selectedDate) ?? null : null),
    [selectedDate, summaries],
  );
  const previewRef = useRef<HTMLDivElement>(null);
  // The preview renders below a potentially tall grid; scroll it into view so a
  // click always produces a visible response.
  useEffect(() => {
    if (selectedDate) previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedDate]);

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

  // Open on the selected range's end month so changing the top date filter moves
  // the calendar there; fall back to the latest day we have data for.
  const anchorMonth = useMemo(() => {
    const anchor = rangeEnd.length === 8
      ? rangeEnd
      : summaries.length > 0 ? summaries[0].date : null; // summaries sorted desc
    if (!anchor || anchor.length !== 8) return new Date();
    return new Date(parseInt(anchor.substring(0, 4)), parseInt(anchor.substring(4, 6)) - 1, 1);
  }, [rangeEnd, summaries]);

  const [viewMonth, setViewMonth] = useState(anchorMonth);

  useEffect(() => {
    setViewMonth(anchorMonth);
  }, [anchorMonth]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  // A selected range spanning 2-4 months renders as one contiguous grid;
  // otherwise a single navigable month.
  const rangeInfo = useMemo(() => {
    if (rangeStart.length !== 8 || rangeEnd.length !== 8) return null;

    const d1 = new Date(parseInt(rangeStart.substring(0, 4)), parseInt(rangeStart.substring(4, 6)) - 1, parseInt(rangeStart.substring(6, 8)));
    const d2 = new Date(parseInt(rangeEnd.substring(0, 4)), parseInt(rangeEnd.substring(4, 6)) - 1, parseInt(rangeEnd.substring(6, 8)));

    const monthsSpan = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()) + 1;
    if (monthsSpan > 1 && monthsSpan <= 4) {
      return { firstDate: d1, lastDate: d2, span: monthsSpan };
    }
    return null;
  }, [rangeStart, rangeEnd]);

  const goToThisMonth = () => {
    const now = new Date();
    setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const prevMonth = () => setViewMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setViewMonth(new Date(year, month + 1, 1));



  // Full-width day detail, rendered inline INSIDE the grid, directly under the
  // week row that contains the selected day — so it expands the calendar in
  // place rather than appearing beneath the whole calendar.
  const detailPanel: ReactNode = selectedDate ? (
    <div
      ref={previewRef}
      style={{ gridColumn: '1 / -1' }}
      className="bg-card-bg p-3 border-t border-card-border animate-in fade-in slide-in-from-top-1 duration-200"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="font-semibold text-foreground truncate">
            {selectedSummary?.formattedDate ?? formatDayLabel(selectedDate)}
          </span>
          {selectedSummary && (
            <>
              <span className={`font-semibold tabular-nums ${pnlColorClass(selectedSummary.totalPnL)}`}>
                {selectedSummary.totalPnL >= 0 ? '+' : ''}${selectedSummary.totalPnL.toFixed(2)}
              </span>
              <span className="text-xs text-muted whitespace-nowrap">· {selectedSummary.totalTrades} trades</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/journal?date=${selectedDate}`}
            className="text-xs font-medium text-accent hover:underline whitespace-nowrap"
          >
            Open full day →
          </Link>
          <button
            type="button"
            onClick={() => setSelectedDate(null)}
            aria-label="Close day preview"
            className="p-1 rounded text-muted hover:text-foreground hover:bg-sidebar-hover transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {!selectedSummary || selectedSummary.trades.length === 0 ? (
        <p className="py-2 text-xs text-muted">No trades on this day.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-card-border divide-y divide-card-border/60">
          {selectedSummary.trades.map((t, i) => (
            <div key={`${t.symbol}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-foreground">{t.symbol}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    t.side === 'LONG' ? 'bg-profit/15 text-profit' : 'bg-loss/15 text-loss'
                  }`}
                >
                  {t.side}
                </span>
                <span className="text-muted whitespace-nowrap">{t.executions} exec</span>
              </div>
              <span className={`font-semibold tabular-nums ${pnlColorClass(t.netPnL)}`}>
                {t.netPnL >= 0 ? '+' : ''}${t.netPnL.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="space-y-2">
      {!rangeInfo && (
        <div className="flex items-center justify-between pb-2 border-b border-card-border">
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-sidebar-hover transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <h3 className="text-xl font-normal text-foreground">
              {viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h3>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-sidebar-hover transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <button
            onClick={goToThisMonth}
            className="px-2.5 py-1 text-xs font-normal rounded-lg border border-card-border text-muted hover:text-foreground hover:bg-sidebar-hover transition-all"
          >
            Go to Today
          </button>
        </div>
      )}

      {rangeInfo ? (
        <ContiguousRangeView
          startDate={rangeInfo.firstDate}
          endDate={rangeInfo.lastDate}
          dataByDate={dataByDate}
          selectedDate={selectedDate}
          detail={detailPanel}
          onDayClick={(date) => setSelectedDate((prev) => (prev === date ? null : date))}
        />
      ) : (
        <MonthView
          year={year}
          month={month}
          dataByDate={dataByDate}
          selectedDate={selectedDate}
          detail={detailPanel}
          onDayClick={(date) => setSelectedDate((prev) => (prev === date ? null : date))}
        />
      )}
    </div>
  );
}

interface ContiguousRangeViewProps {
  startDate: Date;
  endDate: Date;
  dataByDate: Map<string, DayData>;
  onDayClick: (date: string) => void;
  selectedDate: string | null;
  detail: ReactNode;
}

function ContiguousRangeView({ startDate, endDate, dataByDate, onDayClick, selectedDate, detail }: ContiguousRangeViewProps) {
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
          isCurrentMonth: true,
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

      if (currentDate > endDate) break;
      if (weeks.length > 20) break;
    }
    return weeks;
  }, [startDate, endDate, dataByDate]);

  return (
    <div className="grid grid-cols-[repeat(7,1fr)_auto] gap-px bg-card-border rounded-lg overflow-hidden border border-card-border shadow-inner">
      {DAY_HEADERS.map((day) => (
        <div key={day} className="bg-table-header-bg px-2 py-2 text-center text-[10px] font-normal text-muted uppercase tracking-widest">
          {day}
        </div>
      ))}
      <div className="bg-table-header-bg px-3 py-2 text-center text-[10px] font-normal text-muted uppercase tracking-widest">
        Week
      </div>

      {weeks.map((week, wi) => (
        <Fragment key={`wf-${wi}`}>
          {week.days.map((day, di) => (
            <DayCell
              key={day.date}
              day={day}
              showMonthLabel={day.isFirstOfMonth || (wi === 0 && di === 0)}
              onClick={() => onDayClick(day.date)}
            />
          ))}
          <WeekSummary
            key={`w${wi}`}
            weekNum={wi + 1}
            pnl={week.weekPnL}
            days={week.weekDays}
          />
          {selectedDate && week.days.some((d) => d.date === selectedDate) && detail}
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
  selectedDate: string | null;
  detail: ReactNode;
}

function MonthView({ year, month, dataByDate, onDayClick, selectedDate, detail }: MonthViewProps) {
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
          isFirstOfMonth: currentDate.getDate() === 1,
          monthName: currentDate.toLocaleDateString('en-US', { month: 'short' }),
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
        <div key={day} className="bg-table-header-bg px-2 py-2 text-center text-[10px] font-normal text-muted uppercase tracking-widest">
          {day}
        </div>
      ))}
      <div className="bg-table-header-bg px-3 py-2 text-center text-[10px] font-normal text-muted uppercase tracking-widest">
        Week
      </div>

      {weeks.map((week, wi) => (
        <Fragment key={`wf-${wi}`}>
          {week.days.map((day) => (
            <DayCell
              key={day.date}
              day={day}
              showMonthLabel={day.isCurrentMonth && day.isFirstOfMonth}
              onClick={() => onDayClick(day.date)}
            />
          ))}
          <WeekSummary
            key={`w${wi}`}
            weekNum={wi + 1}
            pnl={week.weekPnL}
            days={week.weekDays}
          />
          {selectedDate && week.days.some((d) => d.date === selectedDate) && detail}
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
        {showMonthLabel ? (
          <span className="text-[10px] font-normal uppercase text-white bg-accent px-1.5 py-0.5 rounded shadow-xs tracking-wider">
            {day.monthName}
          </span>
        ) : (
          <span />
        )}
        <span className="text-xs font-normal text-muted group-hover:text-foreground">
          {day.dayNum}
        </span>
      </div>

      {hasData && (
        <div className="flex-1 flex flex-col items-center justify-center gap-0.5 mt-1">
          <span className={`text-sm font-normal tabular-nums ${pnlColorClass(pnl)}`}>
            {formatPnLShort(pnl)}
          </span>
          <div className="flex flex-col items-center leading-tight">
            <span className="text-[9px] text-muted opacity-80 font-normal">
              {day.data!.tradeCount} trades
            </span>
            <span className="text-[9px] text-muted font-normal">
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
      <span className="text-[10px] text-muted font-normal">Week {weekNum}</span>
      <span className={`text-sm font-normal tabular-nums ${pnlColorClass(pnl)}`}>
        {days > 0 ? formatPnLShort(pnl) : '$0'}
      </span>
      <span className="text-[10px] text-accent font-normal">
        {days} day{days !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

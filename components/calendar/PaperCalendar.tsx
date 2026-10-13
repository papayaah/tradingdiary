'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DailySummary } from '@/lib/trading/aggregator';
import { formatCurrency } from '@/lib/currency';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function dateKey(y: number, m: number, d: number) {
  return `${y}${pad(m + 1)}${pad(d)}`;
}

function shortPnL(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '+';
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}$${k.toFixed(k >= 100 ? 0 : k >= 10 ? 1 : 2)}K`;
  }
  return `${sign}$${abs.toFixed(0)}`;
}

// Irregular blob radii so each highlighter swipe looks hand-drawn, not printed.
const HIGHLIGHT_RADIUS = '42% 58% 54% 46% / 62% 48% 60% 44%';

interface PaperCalendarProps {
  summaries: DailySummary[] | null;
  currency: string;
}

export default function PaperCalendar({ summaries, currency }: PaperCalendarProps) {
  const router = useRouter();
  const [view, setView] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });

  const todayKey = useMemo(() => {
    const now = new Date();
    return dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const byDate = useMemo(() => {
    const map = new Map<string, DailySummary>();
    for (const s of summaries ?? []) map.set(s.date, s);
    return map;
  }, [summaries]);

  const { cells, rows } = useMemo(() => {
    const firstWeekday = new Date(view.y, view.m, 1).getDay();
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    const out: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i += 1) out.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return { cells: out, rows: out.length / 7 };
  }, [view]);

  const monthStats = useMemo(() => {
    let net = 0;
    let trades = 0;
    let wins = 0;
    for (let d = 1; d <= 31; d += 1) {
      const s = byDate.get(dateKey(view.y, view.m, d));
      if (!s) continue;
      net += s.totalPnL;
      trades += s.totalTrades;
      wins += s.winCount;
    }
    return { net, trades, winRate: trades > 0 ? (wins / trades) * 100 : 0 };
  }, [byDate, view]);

  const shiftMonth = (delta: number) => {
    setView((prev) => {
      const next = new Date(prev.y, prev.m + delta, 1);
      return { y: next.getFullYear(), m: next.getMonth() };
    });
  };

  const netSign = monthStats.net >= 0 ? '+' : '−';
  const netClass = monthStats.net >= 0 ? 'text-paper-profit' : 'text-paper-loss';

  return (
    <div>
      {/* Hand-drawn wobble filter — defined once, referenced by the grid lines. */}
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <filter id="calendar-rough">
          <feTurbulence type="fractalNoise" baseFrequency="0.013 0.018" numOctaves={2} seed={7} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      {/* Month header */}
      <div className="flex flex-wrap items-center gap-x-7 gap-y-3 pb-5">
        <h1 className="flex items-center gap-3 font-hand text-[clamp(1.9rem,4vw,2.9rem)] leading-none text-ink">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className="text-ink-soft hover:text-ink">
            <ChevronLeft size={30} />
          </button>
          {MONTHS[view.m]} {`'${String(view.y).slice(2)}`}
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className="text-ink-soft hover:text-ink">
            <ChevronRight size={30} />
          </button>
        </h1>

        <div className="flex flex-col">
          <span className={`font-hand text-[clamp(1.6rem,3.4vw,2.6rem)] leading-none tabular-nums ${netClass}`}>
            {netSign}{formatCurrency(Math.abs(monthStats.net), currency)}
          </span>
          <span className="text-[0.95rem] text-ink-soft">this month</span>
        </div>

        <div className="hidden h-12 w-[2.5px] rounded bg-line sm:block" />

        <div className="font-hand text-[clamp(1rem,2.2vw,1.35rem)] text-ink">
          <span className={netClass}>{monthStats.winRate.toFixed(1)}%</span> wins · {monthStats.trades} trades
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 pb-3 text-center font-hand text-[clamp(0.9rem,2vw,1.4rem)] text-ink">
        {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
      </div>

      {/* Grid: wobbly lines behind, cells on top */}
      <div className="relative">
        <svg
          className="pointer-events-none absolute inset-0 z-0 h-full w-full"
          viewBox={`0 0 700 ${rows * 100}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <g stroke="var(--line)" strokeWidth={2.2} fill="none" vectorEffect="non-scaling-stroke" filter="url(#calendar-rough)">
            <rect x={2} y={2} width={696} height={rows * 100 - 4} rx={8} />
            {[1, 2, 3, 4, 5, 6].map((c) => <line key={`v${c}`} x1={c * 100} y1={0} x2={c * 100} y2={rows * 100} />)}
            {Array.from({ length: rows - 1 }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={(i + 1) * 100} x2={700} y2={(i + 1) * 100} />
            ))}
          </g>
        </svg>

        <div className="relative z-10 grid grid-cols-7">
          {cells.map((d, i) => {
            if (d === null) return <div key={`e${i}`} className="min-h-[clamp(84px,14vw,160px)]" />;
            const key = dateKey(view.y, view.m, d);
            const s = byDate.get(key);
            const isToday = key === todayKey;
            const win = s ? s.totalPnL >= 0 : false;
            const clickable = Boolean(s && s.totalTrades > 0);
            return (
              <button
                key={key}
                type="button"
                disabled={!clickable}
                onClick={() => clickable && router.push(`/journal?date=${key}`)}
                className={`relative isolate flex min-h-[clamp(84px,14vw,160px)] flex-col items-start p-2 text-left sm:p-4 ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <span className={`text-[clamp(0.8rem,1.6vw,1.1rem)] ${s ? 'text-ink' : 'text-ink-soft'}`}>
                  {MONTHS[view.m].slice(0, 3)} {d}
                  {isToday && <span className="ml-1 text-[0.75em] text-today">· today</span>}
                </span>

                {s && (
                  <span className="relative isolate my-2 self-start">
                    <span
                      className="absolute -inset-x-2 inset-y-[14%] -z-10 -rotate-[1.6deg]"
                      style={{ background: win ? 'var(--hl-green)' : 'var(--hl-red)', borderRadius: HIGHLIGHT_RADIUS }}
                    />
                    <span className="relative font-hand text-[clamp(1.1rem,2.6vw,2rem)] tabular-nums text-ink">
                      {shortPnL(s.totalPnL)}
                    </span>
                  </span>
                )}

                {s && (
                  <span className="mt-auto text-[clamp(0.7rem,1.4vw,1rem)] text-ink-soft">
                    {s.totalTrades} trades · {Math.round(s.winRate)}%
                  </span>
                )}

                {isToday && !s && (
                  <span
                    className="pointer-events-none absolute inset-2 rounded-[16px] border-[2.5px] border-today opacity-80"
                    style={{ filter: 'url(#calendar-rough)' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

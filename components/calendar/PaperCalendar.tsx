'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { DailySummary } from '@/lib/trading/aggregator';
import { formatCurrency } from '@/lib/currency';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type RangeKey = 'month' | '30d' | '90d' | 'ytd' | 'all';
const RANGE_ORDER: RangeKey[] = ['month', '30d', '90d', 'ytd', 'all'];
const RANGE_LABELS: Record<RangeKey, string> = {
  month: 'This month',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  ytd: 'Year to date',
  all: 'All time',
};

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function dateKey(y: number, m: number, d: number) {
  return `${y}${pad(m + 1)}${pad(d)}`;
}

function longDate(key: string): string {
  if (key.length !== 8) return key;
  const dt = new Date(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8)));
  return Number.isNaN(dt.getTime())
    ? key
    : dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
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
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>('month');
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const rangeMenuRef = useRef<HTMLDivElement>(null);

  const todayKey = useMemo(() => {
    const now = new Date();
    return dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const byDate = useMemo(() => {
    const map = new Map<string, DailySummary>();
    for (const s of summaries ?? []) map.set(s.date, s);
    return map;
  }, [summaries]);

  const weeks = useMemo(() => {
    const firstWeekday = new Date(view.y, view.m, 1).getDay();
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    const flat: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i += 1) flat.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) flat.push(d);
    while (flat.length % 7 !== 0) flat.push(null);
    const out: (number | null)[][] = [];
    for (let i = 0; i < flat.length; i += 7) out.push(flat.slice(i, i + 7));
    return out;
  }, [view]);

  const selectedWeek = useMemo(() => {
    if (!selectedKey) return -1;
    return weeks.findIndex((week) =>
      week.some((d) => d !== null && dateKey(view.y, view.m, d) === selectedKey),
    );
  }, [weeks, selectedKey, view]);

  // Summary totals for the chosen period. 'month' follows the grid; the other
  // ranges are relative to today, mirroring the original dashboard selector.
  const stats = useMemo(() => {
    let startKey = '00000000';
    let endKey = '99999999';
    if (range === 'month') {
      startKey = dateKey(view.y, view.m, 1);
      endKey = dateKey(view.y, view.m, 31);
    } else {
      const now = new Date();
      endKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
      if (range === '30d' || range === '90d') {
        const back = new Date(now);
        back.setDate(now.getDate() - (range === '30d' ? 29 : 89));
        startKey = dateKey(back.getFullYear(), back.getMonth(), back.getDate());
      } else if (range === 'ytd') {
        startKey = dateKey(now.getFullYear(), 0, 1);
      }
    }
    let net = 0;
    let trades = 0;
    let wins = 0;
    for (const s of summaries ?? []) {
      if (s.date >= startKey && s.date <= endKey) {
        net += s.totalPnL;
        trades += s.totalTrades;
        wins += s.winCount;
      }
    }
    return { net, trades, winRate: trades > 0 ? (wins / trades) * 100 : 0 };
  }, [range, view, summaries]);

  const changeMonth = (delta: number) => {
    setSelectedKey(null);
    setView((prev) => {
      const next = new Date(prev.y, prev.m + delta, 1);
      return { y: next.getFullYear(), m: next.getMonth() };
    });
  };

  // ←/→ switch months, matching the original dashboard's keyboard navigation.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      setSelectedKey(null);
      setView((prev) => {
        const next = new Date(prev.y, prev.m + (event.key === 'ArrowLeft' ? -1 : 1), 1);
        return { y: next.getFullYear(), m: next.getMonth() };
      });
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (selectedKey) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedKey]);

  useEffect(() => {
    if (!rangeMenuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (rangeMenuRef.current && !rangeMenuRef.current.contains(event.target as Node)) setRangeMenuOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [rangeMenuOpen]);

  const selected = selectedKey ? byDate.get(selectedKey) ?? null : null;
  const netSign = stats.net >= 0 ? '+' : '−';
  const netClass = stats.net >= 0 ? 'text-paper-profit' : 'text-paper-loss';

  const renderCell = (d: number | null, keyId: string) => {
    if (d === null) return <div key={keyId} className="min-h-[clamp(84px,14vw,160px)]" />;
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
        onClick={() => clickable && setSelectedKey((prev) => (prev === key ? null : key))}
        className={`relative isolate flex min-h-[clamp(84px,14vw,160px)] flex-col items-start p-2 text-left sm:p-4 ${clickable ? 'cursor-pointer' : 'cursor-default'} ${selectedKey === key ? 'bg-paper-2/60' : ''}`}
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
  };

  const renderChunk = (weekList: (number | null)[][], prefix: string) => {
    const n = weekList.length;
    return (
      <div className="relative" key={prefix}>
        <svg
          className="pointer-events-none absolute inset-0 z-0 h-full w-full"
          viewBox={`0 0 700 ${n * 100}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <g stroke="var(--line)" strokeWidth={2.2} fill="none" vectorEffect="non-scaling-stroke" filter="url(#calendar-rough)">
            <rect x={2} y={2} width={696} height={n * 100 - 4} rx={8} />
            {[1, 2, 3, 4, 5, 6].map((c) => <line key={`v${c}`} x1={c * 100} y1={0} x2={c * 100} y2={n * 100} />)}
            {Array.from({ length: n - 1 }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={(i + 1) * 100} x2={700} y2={(i + 1) * 100} />
            ))}
          </g>
        </svg>

        <div className="relative z-10 grid grid-cols-7">
          {weekList.flat().map((d, i) => renderCell(d, `${prefix}-${i}`))}
        </div>
      </div>
    );
  };

  const detailPanel = selected && selectedKey && (
    <div
      ref={detailRef}
      className="my-3 rounded-[16px] border-[2.5px] border-line bg-paper-card p-4"
      style={{ boxShadow: 'var(--paper-shadow)' }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-hand text-[1.3rem] text-ink">{longDate(selectedKey)}</span>
        <span className={`font-hand text-[1.3rem] tabular-nums ${selected.totalPnL >= 0 ? 'text-paper-profit' : 'text-paper-loss'}`}>
          {selected.totalPnL >= 0 ? '+' : '−'}{formatCurrency(Math.abs(selected.totalPnL), currency)}
        </span>
        <span className="text-[0.95rem] text-ink-soft">
          {selected.totalTrades} trades · {Math.round(selected.winRate)}% win
        </span>
        <button
          type="button"
          onClick={() => router.push(`/journal?date=${selectedKey}`)}
          className="ml-auto text-[0.95rem] text-paper-profit hover:underline"
        >
          Open full day →
        </button>
      </div>

      <div className="mt-3 divide-y divide-line-soft">
        {selected.trades.map((trade, i) => (
          <div key={trade.groupKey ?? `${trade.symbol}-${trade.firstTradeTime}-${i}`} className="flex items-center gap-3 py-2">
            <span className="text-[0.95rem] text-ink">{trade.symbol}</span>
            <span className="text-[0.8rem] text-ink-soft">
              {trade.side} · {trade.executions} exec
            </span>
            <span className={`ml-auto font-hand text-[1.05rem] tabular-nums ${trade.netPnL >= 0 ? 'text-paper-profit' : 'text-paper-loss'}`}>
              {formatCurrency(trade.netPnL, currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

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
          <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month" className="text-ink-soft hover:text-ink">
            <ChevronLeft size={30} />
          </button>
          {MONTHS[view.m]} {`'${String(view.y).slice(2)}`}
          <button type="button" onClick={() => changeMonth(1)} aria-label="Next month" className="text-ink-soft hover:text-ink">
            <ChevronRight size={30} />
          </button>
        </h1>

        <div className="flex flex-col">
          <span className={`font-hand text-[clamp(1.6rem,3.4vw,2.6rem)] leading-none tabular-nums ${netClass}`}>
            {netSign}{formatCurrency(Math.abs(stats.net), currency)}
          </span>
          <div ref={rangeMenuRef} className="relative mt-0.5">
            <button
              type="button"
              onClick={() => setRangeMenuOpen((prev) => !prev)}
              className="flex items-center gap-1 text-[0.95rem] text-ink-soft hover:text-ink"
              aria-expanded={rangeMenuOpen}
            >
              {RANGE_LABELS[range].toLowerCase()}
              <ChevronDown size={14} className={`transition-transform ${rangeMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {rangeMenuOpen && (
              <div
                className="absolute left-0 top-[135%] z-40 min-w-[170px] rounded-[12px] border-[2.5px] border-line bg-paper-card p-1.5"
                style={{ boxShadow: 'var(--paper-shadow)' }}
              >
                {RANGE_ORDER.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setRange(r);
                      setRangeMenuOpen(false);
                    }}
                    className={`block w-full rounded-lg px-3 py-1.5 text-left text-[0.95rem] ${
                      range === r ? 'bg-paper-2 text-ink' : 'text-ink-soft hover:bg-paper-2 hover:text-ink'
                    }`}
                  >
                    {RANGE_LABELS[r]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="hidden h-12 w-[2.5px] rounded bg-line sm:block" />

        <div className="font-hand text-[clamp(1rem,2.2vw,1.35rem)] text-ink">
          <span className={netClass}>{stats.winRate.toFixed(1)}%</span> wins · {stats.trades} trades
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 pb-3 text-center font-hand text-[clamp(0.9rem,2vw,1.4rem)] text-ink">
        {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
      </div>

      {/* Grid — split at the selected week so the day detail expands in place. */}
      {selectedWeek >= 0 ? (
        <>
          {renderChunk(weeks.slice(0, selectedWeek + 1), 'top')}
          {detailPanel}
          {weeks.length > selectedWeek + 1 && renderChunk(weeks.slice(selectedWeek + 1), 'bottom')}
        </>
      ) : (
        renderChunk(weeks, 'all')
      )}
    </div>
  );
}

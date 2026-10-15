'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { DailySummary } from '@/lib/trading/aggregator';
import { formatCurrency } from '@/lib/currency';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type RangeKey = 'month' | '30d' | '90d' | 'ytd' | 'all' | 'custom';
const RANGE_ORDER: RangeKey[] = ['month', '30d', '90d', 'ytd', 'all', 'custom'];
const RANGE_LABELS: Record<RangeKey, string> = {
  month: 'This month',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  ytd: 'Year to date',
  all: 'All time',
  custom: 'Custom range…',
};

// Cap a contiguous range grid so "all time" can't render thousands of cells.
const MAX_WEEKS = 80;

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function dateKey(y: number, m: number, d: number) {
  return `${y}${pad(m + 1)}${pad(d)}`;
}

function keyFromDate(dt: Date) {
  return dateKey(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

function parseKey(key: string) {
  return { y: Number(key.slice(0, 4)), m: Number(key.slice(4, 6)) - 1, d: Number(key.slice(6, 8)) };
}

function longDate(key: string): string {
  if (key.length !== 8) return key;
  const { y, m, d } = parseKey(key);
  const dt = new Date(y, m, d);
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function shortDate(dt: Date): string {
  return `${MONTHS[dt.getMonth()].slice(0, 3)} ${dt.getDate()}`;
}

function agendaLabel(key: string): string {
  const { y, m, d } = parseKey(key);
  return new Date(y, m, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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
  const [customStart, setCustomStart] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  });
  const [customEnd, setCustomEnd] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  });
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

  // The grid spans exactly the selected period. 'month' is a single navigable
  // month; every other range is a contiguous span, so the grid and the summary
  // always agree.
  const { gridStart, gridEnd, isMonthMode, clamped } = useMemo(() => {
    if (range === 'month') {
      return {
        gridStart: new Date(view.y, view.m, 1),
        gridEnd: new Date(view.y, view.m + 1, 0),
        isMonthMode: true,
        clamped: false,
      };
    }
    const now = new Date();
    let start: Date;
    let end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (range === 'custom') {
      start = customStart ? new Date(`${customStart}T00:00:00`) : new Date(view.y, view.m, 1);
      end = customEnd ? new Date(`${customEnd}T00:00:00`) : end;
      if (start > end) [start, end] = [end, start];
    } else if (range === '30d' || range === '90d') {
      start = new Date(end);
      start.setDate(end.getDate() - (range === '30d' ? 29 : 89));
    } else if (range === 'ytd') {
      start = new Date(now.getFullYear(), 0, 1);
    } else {
      let min: string | null = null;
      for (const s of summaries ?? []) if (min === null || s.date < min) min = s.date;
      start = min ? new Date(Number(min.slice(0, 4)), Number(min.slice(4, 6)) - 1, Number(min.slice(6, 8))) : new Date(now.getFullYear(), 0, 1);
    }
    let didClamp = false;
    if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_WEEKS * 7) {
      start = new Date(end);
      start.setDate(end.getDate() - MAX_WEEKS * 7);
      didClamp = true;
    }
    return { gridStart: start, gridEnd: end, isMonthMode: false, clamped: didClamp };
  }, [range, view, customStart, customEnd, summaries]);

  const weeks = useMemo(() => {
    const first = new Date(gridStart);
    first.setDate(gridStart.getDate() - gridStart.getDay());
    const last = new Date(gridEnd);
    last.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));
    const out: (string | null)[][] = [];
    const cur = new Date(first);
    while (cur <= last && out.length < MAX_WEEKS + 1) {
      const week: (string | null)[] = [];
      for (let i = 0; i < 7; i += 1) {
        const inScope = cur >= gridStart && cur <= gridEnd;
        week.push(inScope ? keyFromDate(cur) : null);
        cur.setDate(cur.getDate() + 1);
      }
      out.push(week);
    }
    return out;
  }, [gridStart, gridEnd]);

  const selectedWeek = useMemo(
    () => (selectedKey ? weeks.findIndex((week) => week.includes(selectedKey)) : -1),
    [weeks, selectedKey],
  );

  // Trading days in range, in order — the phone agenda list.
  const agendaDays = useMemo(
    () => weeks.flat().filter((k): k is string => Boolean(k) && byDate.has(k)),
    [weeks, byDate],
  );

  const stats = useMemo(() => {
    const startKey = keyFromDate(gridStart);
    const endKey = keyFromDate(gridEnd);
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
  }, [gridStart, gridEnd, summaries]);

  const changeMonth = (delta: number) => {
    setSelectedKey(null);
    setView((prev) => {
      const next = new Date(prev.y, prev.m + delta, 1);
      return { y: next.getFullYear(), m: next.getMonth() };
    });
  };

  const pickRange = (r: RangeKey) => {
    setSelectedKey(null);
    setRange(r);
    setRangeMenuOpen(false);
  };

  // ←/→ switch months — only in single-month mode.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isMonthMode) return;
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
      changeMonth(event.key === 'ArrowLeft' ? -1 : 1);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMonthMode]);

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

  const gridStartKey = keyFromDate(gridStart);

  const renderCell = (key: string | null, keyId: string) => {
    if (key === null) return <div key={keyId} className="min-h-[clamp(84px,14vw,160px)]" />;
    const { m, d } = parseKey(key);
    const s = byDate.get(key);
    const isToday = key === todayKey;
    // Mark where a new month begins (and the first visible day) so month
    // boundaries read clearly in a contiguous multi-month grid.
    const monthStart = d === 1 || key === gridStartKey;
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
          {monthStart ? (
            <span className="inline-block rounded-[9px_7px_10px_6px] bg-ink px-2 py-[3px] font-hand text-[0.95em] uppercase leading-none text-paper-card">
              {MONTHS[m].slice(0, 3)} {d}
            </span>
          ) : (
            <>{MONTHS[m].slice(0, 3)} {d}</>
          )}
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

  const weekNetOf = (week: (string | null)[]) => {
    let net = 0;
    let has = false;
    for (const key of week) {
      if (!key) continue;
      const s = byDate.get(key);
      if (s) {
        net += s.totalPnL;
        has = true;
      }
    }
    return { net, has };
  };

  const renderChunk = (weekList: (string | null)[][], prefix: string) => {
    const n = weekList.length;
    return (
      <div className="relative" key={prefix}>
        <svg
          className="pointer-events-none absolute inset-0 z-0 h-full w-full"
          viewBox={`0 0 800 ${n * 100}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <g stroke="var(--line)" strokeWidth={2.2} fill="none" vectorEffect="non-scaling-stroke" filter="url(#calendar-rough)">
            <rect x={2} y={2} width={796} height={n * 100 - 4} rx={8} />
            {[1, 2, 3, 4, 5, 6, 7].map((c) => <line key={`v${c}`} x1={c * 100} y1={0} x2={c * 100} y2={n * 100} />)}
            {Array.from({ length: n - 1 }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={(i + 1) * 100} x2={800} y2={(i + 1) * 100} />
            ))}
          </g>
        </svg>

        <div className="relative z-10 grid grid-cols-8">
          {weekList.map((week, wi) => {
            const wk = weekNetOf(week);
            return (
              <Fragment key={`${prefix}-w${wi}`}>
                {week.map((key, di) => renderCell(key, `${prefix}-${wi}-${di}`))}
                <div className="flex min-h-[clamp(84px,14vw,160px)] flex-col items-center justify-center p-1 text-center">
                  {wk.has && (
                    <span className={`font-hand text-[clamp(0.85rem,1.7vw,1.25rem)] tabular-nums ${wk.net >= 0 ? 'text-paper-profit' : 'text-paper-loss'}`}>
                      {shortPnL(wk.net)}
                    </span>
                  )}
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
    );
  };

  const tradeRows = (summary: DailySummary) => (
    <div className="divide-y divide-line-soft">
      {summary.trades.map((trade, i) => (
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
  );

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

      <div className="mt-3">{tradeRows(selected)}</div>
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

      {/* Header — fixed vertical stack on phones so varying number widths can't
          shift the layout; inline row on desktop. */}
      <div className="flex flex-col items-start gap-3 pb-5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-7 sm:gap-y-3">
        <h1 className="flex items-center gap-3 font-hand text-[clamp(1.6rem,3.6vw,2.9rem)] leading-none text-ink">
          {isMonthMode ? (
            <>
              <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month" className="text-ink-soft hover:text-ink">
                <ChevronLeft size={30} />
              </button>
              {MONTHS[view.m]} {`'${String(view.y).slice(2)}`}
              <button type="button" onClick={() => changeMonth(1)} aria-label="Next month" className="text-ink-soft hover:text-ink">
                <ChevronRight size={30} />
              </button>
            </>
          ) : (
            <span>{shortDate(gridStart)} – {shortDate(gridEnd)} {`'${String(gridEnd.getFullYear()).slice(2)}`}</span>
          )}
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
                    onClick={() => pickRange(r)}
                    className={`block w-full rounded-lg px-3 py-1.5 text-left text-[0.95rem] ${
                      range === r ? 'bg-paper-2 text-ink' : 'text-ink-soft hover:bg-paper-2 hover:text-ink'
                    }`}
                  >
                    {RANGE_LABELS[r]}
                  </button>
                ))}
              </div>
            )}

            {range === 'custom' && (
              <div className="mt-2 flex flex-wrap items-center gap-2 font-sans">
                <input
                  type="date"
                  value={customStart}
                  max={customEnd || undefined}
                  onChange={(event) => {
                    setSelectedKey(null);
                    setCustomStart(event.target.value);
                  }}
                  aria-label="Range start date"
                  className="rounded-[10px] border-2 border-line bg-paper-card px-2.5 py-1 text-[13px] text-ink outline-none focus:ring-2 focus:ring-paper-profit/30"
                />
                <span className="text-ink-soft">→</span>
                <input
                  type="date"
                  value={customEnd}
                  min={customStart || undefined}
                  onChange={(event) => {
                    setSelectedKey(null);
                    setCustomEnd(event.target.value);
                  }}
                  aria-label="Range end date"
                  className="rounded-[10px] border-2 border-line bg-paper-card px-2.5 py-1 text-[13px] text-ink outline-none focus:ring-2 focus:ring-paper-profit/30"
                />
              </div>
            )}

            {clamped && (
              <div className="mt-1 text-[0.8rem] text-ink-soft">Showing the most recent {MAX_WEEKS} weeks</div>
            )}
          </div>
        </div>

        <div className="hidden h-12 w-[2.5px] rounded bg-line sm:block" />

        <div className="font-hand text-[clamp(1rem,2.2vw,1.35rem)] text-ink">
          <span className={netClass}>{stats.winRate.toFixed(1)}%</span> wins · {stats.trades} trades
        </div>
      </div>

      {/* Desktop: the wobbly grid with weekly totals. */}
      <div className="hidden sm:block">
        <div className="grid grid-cols-8 pb-3 text-center font-hand text-[clamp(0.9rem,2vw,1.4rem)] text-ink">
          {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
          <div className="text-ink-soft">Week</div>
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

      {/* Phone: a day-by-day agenda; each day expands to its trades. */}
      <div className="border-t-2 border-dashed border-line-soft sm:hidden">
        {agendaDays.length === 0 ? (
          <div className="py-12 text-center text-[1rem] text-ink-soft">No trades in this range.</div>
        ) : (
          agendaDays.map((key) => {
            const s = byDate.get(key);
            if (!s) return null;
            const open = selectedKey === key;
            const win = s.totalPnL >= 0;
            const isToday = key === todayKey;
            return (
              <div key={key} className="border-b-2 border-dashed border-line-soft">
                <button
                  type="button"
                  onClick={() => setSelectedKey((prev) => (prev === key ? null : key))}
                  className="flex w-full items-center gap-3 py-4 text-left"
                  aria-expanded={open}
                >
                  <ChevronRight size={16} className={`shrink-0 text-ink-soft transition-transform ${open ? 'rotate-90 text-ink' : ''}`} />
                  <span className={`flex-1 text-[15.5px] ${isToday ? 'text-today' : 'text-ink'}`}>
                    {agendaLabel(key)}{isToday ? ' · today' : ''}
                  </span>
                  <span className="whitespace-nowrap text-[13px] text-ink-soft">
                    {s.totalTrades} trades · {Math.round(s.winRate)}%
                  </span>
                  <span className="relative isolate ml-1 min-w-[80px] text-right">
                    <span
                      className="absolute -inset-x-2 inset-y-[14%] -z-10 -rotate-[2deg]"
                      style={{ background: win ? 'var(--hl-green)' : 'var(--hl-red)', borderRadius: HIGHLIGHT_RADIUS }}
                    />
                    <span className="relative font-hand text-[23px] tabular-nums text-ink">{shortPnL(s.totalPnL)}</span>
                  </span>
                </button>
                {open && (
                  <div className="pb-4 pl-7">
                    {tradeRows(s)}
                    <button
                      type="button"
                      onClick={() => router.push(`/journal?date=${key}`)}
                      className="mt-2 text-[0.9rem] text-paper-profit hover:underline"
                    >
                      Open full day →
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

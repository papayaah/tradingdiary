'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import type { DailySummary } from '@/lib/trading/aggregator';
import { formatCurrency } from '@/lib/currency';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function parseKey(key: string) {
  return { y: Number(key.slice(0, 4)), m: Number(key.slice(4, 6)) - 1, d: Number(key.slice(6, 8)) };
}

function prettyKey(key: string) {
  return `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;
}

function monthLabel(key: string): string {
  const { y, m } = parseKey(key);
  return `${MONTHS[m]} ${y}`;
}

// "Tue, Oct 20" — short, since the month header carries the month + year.
function rowLabel(key: string): string {
  const { y, m, d } = parseKey(key);
  return new Date(y, m, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

interface MonthGroup {
  monthKey: string;
  label: string;
  total: number;
  days: DailySummary[];
}

export default function PaperJournalList({
  summaries,
  currency,
}: {
  summaries: DailySummary[];
  currency: string;
}) {
  const router = useRouter();

  // Summaries arrive newest-first; group consecutive runs of the same month.
  const groups = useMemo(() => {
    const out: MonthGroup[] = [];
    for (const s of summaries) {
      const monthKey = s.date.slice(0, 6);
      let group = out[out.length - 1];
      if (!group || group.monthKey !== monthKey) {
        group = { monthKey, label: monthLabel(s.date), total: 0, days: [] };
        out.push(group);
      }
      group.days.push(s);
      group.total += s.totalPnL;
    }
    return out;
  }, [summaries]);

  const signed = (value: number) =>
    `${value < 0 ? '−' : '+'}${formatCurrency(Math.abs(value), currency)}`;

  return (
    <div className="pb-4">
      {groups.map((group) => (
        <section key={group.monthKey}>
          <div className="sticky top-0 z-10 flex items-baseline justify-between gap-3 border-b-2 border-line bg-paper/95 py-2 backdrop-blur-sm">
            <h2 className="font-hand text-[1.35rem] leading-none text-ink-soft">{group.label}</h2>
            <span className="text-[0.82rem] text-ink-soft">
              Realized{' '}
              <span
                className={`font-semibold tabular-nums ${group.total >= 0 ? 'text-paper-profit' : 'text-paper-loss'}`}
              >
                {signed(group.total)}
              </span>{' '}
              · {currency}
            </span>
          </div>

          <ul>
            {group.days.map((day) => {
              const open = day.trades.filter((t) => t.isOpen);
              const unrealized = open.reduce((sum, t) => sum + (t.unrealizedPnL ?? 0), 0);
              const hasUnrealizedNumber = open.some((t) => t.unrealizedPnL != null);
              const win = day.totalPnL >= 0;
              return (
                <li key={day.date}>
                  <button
                    type="button"
                    onClick={() => router.push(`/journal/${prettyKey(day.date)}`)}
                    className="group flex min-h-[64px] w-full items-center gap-4 border-b-2 border-dashed border-line-soft px-1 py-3 text-left transition-colors hover:bg-paper-2/50"
                  >
                    <span className="w-[108px] shrink-0 font-hand text-[1.05rem] leading-tight text-ink sm:w-[150px] sm:text-[1.15rem]">
                      {rowLabel(day.date)}
                    </span>
                    <span className="flex-1 text-[0.85rem] text-ink-soft">
                      {day.totalTrades} trade{day.totalTrades === 1 ? '' : 's'}
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className={`block text-[1.05rem] font-semibold tabular-nums ${win ? 'text-paper-profit' : 'text-paper-loss'}`}
                      >
                        {signed(day.totalPnL)}
                      </span>
                      {open.length > 0 && (
                        <span className="mt-0.5 block text-[0.75rem] text-ink-soft">
                          {hasUnrealizedNumber ? `Unrealized ≈ ${signed(unrealized)}` : `${open.length} open`}
                        </span>
                      )}
                    </span>
                    <ChevronRight
                      size={18}
                      className="shrink-0 text-ink-soft opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAccount } from '@/contexts/AccountContext';
import { getJournalSummaries } from '@/lib/trading/journal-summaries-cache';
import { onJournalSynced } from '@/lib/journal/sync-bus';
import { getDailyNote, saveDailyNote, getAllTradeNotes, saveTradeNoteContent, tradeRef } from '@/lib/db/notes';
import { exchangeTimeLabel } from '@/lib/trading/exchange-time';
import { formatCurrency } from '@/lib/currency';
import type { DailySummary } from '@/lib/trading/aggregator';

const HIGHLIGHT_RADIUS = '42% 58% 54% 46% / 62% 48% 60% 44%';

function toKey(pretty: string) {
  return pretty.replace(/-/g, '');
}

function shiftPretty(pretty: string, delta: number): string {
  const [y, m, d] = pretty.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function longLabel(pretty: string): string {
  const [y, m, d] = pretty.split('-').map(Number);
  if (!y || !m || !d) return pretty;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function fmtTime(time: string): string {
  const [h, m] = time.split(':');
  const hour = Number(h);
  if (!Number.isFinite(hour)) return time;
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${(m ?? '00').padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export default function PaperDayView({ dateParam }: { dateParam: string }) {
  const router = useRouter();
  const { accounts, selectedAccountId } = useAccount();
  const currency = accounts.find((a) => a.accountId === selectedAccountId)?.currency ?? 'USD';
  const dateKey = toKey(dateParam);

  const [summary, setSummary] = useState<DailySummary | null | undefined>(undefined);
  const [dailyNote, setDailyNote] = useState('');
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [tab, setTab] = useState<'trades' | 'notes'>('trades');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => onJournalSynced(() => setRefreshKey((k) => k + 1)), []);

  useEffect(() => {
    if (!selectedAccountId) return;
    let active = true;
    getJournalSummaries(selectedAccountId)
      .then((list) => {
        if (active) setSummary(list.find((s) => s.date === dateKey) ?? null);
      })
      .catch(() => {
        if (active) setSummary(null);
      });
    getDailyNote(dateKey, selectedAccountId).then((n) => {
      if (active) setDailyNote(n?.content ?? '');
    });
    getAllTradeNotes().then((notes) => {
      if (!active) return;
      const map: Record<string, string> = {};
      for (const n of notes) if (n.content) map[n.tradeGroupKey] = n.content;
      setNoteMap(map);
    });
    return () => {
      active = false;
    };
  }, [selectedAccountId, dateKey, refreshKey]);

  const saveTradeNote = async (groupKey: string, trade: { groupKey?: string; date: string; symbol: string }, content: string) => {
    if (!selectedAccountId) return;
    setNoteMap((prev) => ({ ...prev, [groupKey]: content }));
    setEditingKey(null);
    await saveTradeNoteContent(tradeRef(trade, selectedAccountId), content);
  };

  const loading = Boolean(selectedAccountId) && summary === undefined;
  const day = selectedAccountId ? summary ?? null : null;
  const realized = day?.totalPnL ?? 0;
  const netClass = realized >= 0 ? 'text-paper-profit' : 'text-paper-loss';
  const tz = exchangeTimeLabel(dateKey);

  return (
    <div
      className="min-h-full bg-paper font-hand text-ink"
      style={{
        backgroundImage: 'radial-gradient(var(--dot) 1.4px, transparent 1.4px)',
        backgroundSize: '22px 22px',
      }}
    >
      <div className="mx-auto max-w-[1000px] px-4 pb-16 pt-6 sm:px-7">
        <Link href="/calendar" className="inline-flex items-center gap-1 text-[0.95rem] text-ink-soft hover:text-ink">
          <ChevronLeft size={16} /> Calendar
        </Link>

        {/* Day header */}
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 font-hand text-[clamp(1.5rem,3.4vw,2.3rem)] leading-none text-ink">
              <button
                type="button"
                onClick={() => router.push(`/journal/${shiftPretty(dateParam, -1)}`)}
                aria-label="Previous day"
                className="text-ink-soft hover:text-ink"
              >
                <ChevronLeft size={26} />
              </button>
              {longLabel(dateParam)}
              <button
                type="button"
                onClick={() => router.push(`/journal/${shiftPretty(dateParam, 1)}`)}
                aria-label="Next day"
                className="text-ink-soft hover:text-ink"
              >
                <ChevronRight size={26} />
              </button>
            </h1>
            <div className="mt-1 text-[0.9rem] text-ink-soft">
              {day ? `${day.trades.length} trades` : 'No trades'} · {tz}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[1.1rem] text-ink-soft">Realized P&amp;L</span>
            <span className="relative isolate">
              <span
                className="absolute -inset-x-2 inset-y-[14%] -z-10 -rotate-[1.6deg]"
                style={{ background: realized >= 0 ? 'var(--hl-green)' : 'var(--hl-red)', borderRadius: HIGHLIGHT_RADIUS }}
              />
              <span className={`relative font-hand text-[clamp(1.4rem,3vw,2rem)] tabular-nums ${netClass}`}>
                {realized >= 0 ? '+' : '−'}{formatCurrency(Math.abs(realized), currency)}
              </span>
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-5 flex items-center gap-5 border-b-2 border-line-soft pb-2 text-[1.05rem]">
          <button type="button" onClick={() => setTab('trades')} className={tab === 'trades' ? 'text-ink underline decoration-2 underline-offset-[6px]' : 'text-ink-soft hover:text-ink'}>
            Trades
          </button>
          <button type="button" onClick={() => setTab('notes')} className={tab === 'notes' ? 'text-ink underline decoration-2 underline-offset-[6px]' : 'text-ink-soft hover:text-ink'}>
            Daily notes
          </button>
        </div>

        {tab === 'trades' ? (
          <div className="mt-2">
            {loading && <div className="py-12 text-center text-ink-soft">Loading…</div>}
            {!loading && !day && <div className="py-12 text-center text-ink-soft">No trades recorded on this day.</div>}
            {day && day.trades.map((trade, i) => {
              const key = trade.groupKey ?? `${trade.date}:${trade.symbol}:${i}`;
              const note = noteMap[trade.groupKey ?? ''] ?? '';
              const win = trade.netPnL >= 0;
              return (
                <div key={key} className="border-b-2 border-dashed border-line-soft py-3">
                  <div className="flex items-start gap-3">
                    <span className="w-[76px] shrink-0 text-[0.9rem] text-ink-soft">{fmtTime(trade.firstTradeTime)}</span>
                    <div className="min-w-0 flex-1">
                      <span className="text-[1rem] text-ink">{trade.symbol}</span>
                      <span className="ml-2 text-[0.85rem] text-ink-soft">{trade.side === 'LONG' ? 'Long' : 'Short'}</span>
                      {trade.companyName && <div className="truncate text-[0.78rem] text-ink-soft">{trade.companyName}</div>}
                    </div>
                    {trade.isOpen ? (
                      <span className="shrink-0 text-right">
                        <span className="rounded-md border-2 border-line-soft px-2 py-0.5 text-[0.75rem] text-ink-soft">Open</span>
                        {trade.unrealizedPnL != null && (
                          <span className="mt-0.5 block text-[0.75rem] text-ink-soft">Unrealized {formatCurrency(trade.unrealizedPnL, currency)}</span>
                        )}
                      </span>
                    ) : (
                      <span className="relative isolate shrink-0">
                        <span
                          className="absolute -inset-x-2 inset-y-[12%] -z-10 -rotate-[1.6deg]"
                          style={{ background: win ? 'var(--hl-green)' : 'var(--hl-red)', borderRadius: HIGHLIGHT_RADIUS }}
                        />
                        <span className="relative font-hand text-[1.1rem] tabular-nums text-ink">{formatCurrency(trade.netPnL, currency)}</span>
                      </span>
                    )}
                  </div>

                  <div className="mt-1 pl-[88px]">
                    {editingKey === key ? (
                      <textarea
                        autoFocus
                        defaultValue={note}
                        onBlur={(e) => saveTradeNote(trade.groupKey ?? key, trade, e.target.value.trim())}
                        placeholder="Add a note…"
                        className="w-full resize-none rounded-[12px] border-2 border-line bg-paper-card px-3 py-2 font-sans text-[0.9rem] text-ink outline-none focus:ring-2 focus:ring-paper-profit/30"
                        rows={2}
                      />
                    ) : note ? (
                      <button type="button" onClick={() => setEditingKey(key)} className="text-left text-[0.9rem] text-ink hover:opacity-80">
                        {note}
                      </button>
                    ) : (
                      <button type="button" onClick={() => setEditingKey(key)} className="text-[0.9rem] text-ink-soft hover:text-ink">
                        + Add note
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4">
            <textarea
              value={dailyNote}
              onChange={(e) => setDailyNote(e.target.value)}
              onBlur={(e) => selectedAccountId && saveDailyNote(dateKey, selectedAccountId, e.target.value)}
              placeholder="How did the day go? Plan, mistakes, lessons…"
              className="min-h-[220px] w-full resize-y rounded-[12px] border-[2.5px] border-line bg-paper-card px-4 py-3 font-sans text-[0.95rem] leading-relaxed text-ink outline-none focus:ring-2 focus:ring-paper-profit/30"
            />
          </div>
        )}
      </div>
    </div>
  );
}

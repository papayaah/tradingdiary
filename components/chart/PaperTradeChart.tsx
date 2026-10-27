'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchCandles } from '@/lib/chart/fetch';
import { etWallClockToEpochSeconds } from '@/lib/chart/execution-time';
import type { OHLCCandle } from '@/lib/chart/types';
import type { TransactionRecord } from '@/lib/db/schema';
import PaperCandleChart from './PaperCandleChart';

// Interval buttons offered for an intraday trade. The duration gates which show;
// 30m / 4h / daily (multi-day spans) need provider resampling — a later step.
const INTRADAY: { label: string; min: number }[] = [
  { label: '1m', min: 1 },
  { label: '5m', min: 5 },
  { label: '10m', min: 10 },
  { label: '15m', min: 15 },
  { label: '1h', min: 60 },
];

interface PaperTradeChartProps {
  symbol: string;
  date: string;
  transactions: TransactionRecord[];
  highlightedExecutionId?: string | null;
  onHover?: (transactionId: string | null) => void;
}

export default function PaperTradeChart({
  symbol,
  date,
  transactions,
  highlightedExecutionId = null,
  onHover,
}: PaperTradeChartProps) {
  // Trade span (minutes) and whether it crosses days, from the fills.
  const { spanMin, multiDay, firstEpoch, lastEpoch } = useMemo(() => {
    const dates = new Set(transactions.map((t) => t.date));
    let lo = Infinity, hi = -Infinity;
    for (const t of transactions) {
      const e = etWallClockToEpochSeconds(t.date, t.time);
      if (e == null) continue;
      if (e < lo) lo = e;
      if (e > hi) hi = e;
    }
    const span = hi > lo ? (hi - lo) / 60 : 0;
    return { spanMin: span, multiDay: dates.size > 1, firstEpoch: lo, lastEpoch: hi };
  }, [transactions]);

  // Finest interval that keeps the framed window under ~90 candles.
  const defaultInterval = useMemo(() => {
    const buffer = Math.max(spanMin * 0.4, 15);
    const windowMin = spanMin + buffer * 2;
    const pick = INTRADAY.find((iv) => windowMin / iv.min <= 90);
    return (pick ?? INTRADAY[INTRADAY.length - 1]).label;
  }, [spanMin]);

  const [interval, setInterval] = useState(defaultInterval);
  const [candles, setCandles] = useState<OHLCCandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setInterval(defaultInterval);
  }, [defaultInterval]);

  useEffect(() => {
    if (multiDay) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchCandles(symbol, date, interval)
      .then((raw) => {
        if (cancelled) return;
        if (!raw.length) {
          setError('No chart data available for this symbol/day.');
          setCandles([]);
          return;
        }
        // Frame tightly around the trade (first→last fill) with a buffer.
        const bufferSec = Math.max((lastEpoch - firstEpoch) * 0.4, 15 * 60);
        const lo = firstEpoch - bufferSec, hi = lastEpoch + bufferSec;
        const framed = raw.filter((c) => c.time >= lo && c.time <= hi);
        setCandles(framed.length >= 3 ? framed : raw);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load chart');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, date, interval, multiDay, firstEpoch, lastEpoch]);

  if (multiDay) {
    return (
      <div className="flex min-h-[180px] items-center justify-center p-6 text-center text-[0.9rem] text-ink-soft">
        This trade spans multiple days — a daily chart for multi-day trades is coming soon.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 px-3 pt-3">
        {INTRADAY.map((iv) => (
          <button
            key={iv.label}
            type="button"
            onClick={() => setInterval(iv.label)}
            className={`rounded-[9px] px-2.5 py-0.5 text-[0.8rem] transition-colors ${
              interval === iv.label ? 'bg-paper-2 text-ink' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {iv.label}
          </button>
        ))}
      </div>
      <div className="px-2 pb-2">
        {loading && <div className="flex items-center justify-center py-16 text-[0.9rem] text-ink-soft">Loading chart…</div>}
        {!loading && error && <div className="flex items-center justify-center py-16 text-[0.9rem] text-ink-soft">{error}</div>}
        {!loading && !error && (
          <PaperCandleChart
            candles={candles}
            transactions={transactions}
            date={date}
            highlightedTransactionId={highlightedExecutionId}
            onHover={onHover}
          />
        )}
      </div>
    </div>
  );
}

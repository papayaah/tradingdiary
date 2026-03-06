'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { Upload, PlayCircle } from 'lucide-react';
import { getTransactionsByAccount } from '@/lib/db/trades';
import { getTradeDateCutoff } from '@/lib/settings';
import { aggregateByDay } from '@/lib/trading/aggregator';
import {
  timeToSeconds,
  secondsToTime,
  computePnLTimeline,
  findSnapshot,
  usePlaybackEngine,
} from '@/lib/replay/engine';
import type { TransactionRecord } from '@/lib/db/schema';
import ReplayTimeline from '@/components/replay/ReplayTimeline';
import ReplayControls from '@/components/replay/ReplayControls';
import ReplayStats from '@/components/replay/ReplayStats';
import { useAccount } from '@/contexts/AccountContext';

interface DayOption {
  date: string;
  formattedDate: string;
  tradeCount: number;
  transactions: TransactionRecord[];
}

export default function ReplayPage() {
  const { selectedAccountId } = useAccount();
  const [dayOptions, setDayOptions] = useState<DayOption[] | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const prevVisibleCountRef = useRef(0);

  // Load transactions and build day options based on active account
  useEffect(() => {
    async function load() {
      if (!selectedAccountId) {
        setDayOptions([]);
        return;
      }

      setDayOptions(null); // Show loading state on switch
      const transactions = await getTransactionsByAccount(selectedAccountId);

      if (transactions.length === 0) {
        setDayOptions([]);
        return;
      }

      const cutoff = getTradeDateCutoff();
      const summaries = aggregateByDay(transactions, cutoff);

      // Group raw transactions by date
      const txByDate = new Map<string, TransactionRecord[]>();
      for (const day of summaries) {
        const dateTxns: TransactionRecord[] = [];
        for (const trade of day.trades) {
          dateTxns.push(...trade.transactions);
        }
        txByDate.set(day.date, dateTxns);
      }

      const options: DayOption[] = summaries.map((s) => ({
        date: s.date,
        formattedDate: s.formattedDate,
        tradeCount: s.trades.reduce((sum, t) => sum + t.executions, 0),
        transactions: txByDate.get(s.date) ?? [],
      }));

      setDayOptions(options);
      if (options.length > 0) {
        setSelectedDate(options[0].date);
      }
    }
    load();
  }, [selectedAccountId]);

  // Get selected day's data
  const selectedDay = dayOptions?.find((d) => d.date === selectedDate);

  const dayTransactions = useMemo(() => {
    if (!selectedDay) return [];
    return [...selectedDay.transactions].sort(
      (a, b) => timeToSeconds(a.time) - timeToSeconds(b.time)
    );
  }, [selectedDay]);

  const symbols = useMemo(() => {
    const seen = new Map<string, number>();
    for (const t of dayTransactions) {
      const ts = timeToSeconds(t.time);
      if (!seen.has(t.symbol) || ts < seen.get(t.symbol)!) {
        seen.set(t.symbol, ts);
      }
    }
    return [...seen.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([sym]) => sym);
  }, [dayTransactions]);

  const timeRange = useMemo(() => {
    if (dayTransactions.length === 0) return { start: 0, end: 0 };
    const times = dayTransactions.map((t) => timeToSeconds(t.time));
    const min = Math.min(...times);
    const max = Math.max(...times);
    // Add 5 min padding on each side
    return { start: Math.max(0, min - 300), end: Math.min(86400, max + 300) };
  }, [dayTransactions]);

  const snapshots = useMemo(
    () => computePnLTimeline(dayTransactions),
    [dayTransactions]
  );

  const [playback, actions] = usePlaybackEngine(
    timeRange.start,
    timeRange.end
  );

  // Compute current stats
  const currentSnapshot = useMemo(
    () => findSnapshot(snapshots, playback.currentTimeSeconds),
    [snapshots, playback.currentTimeSeconds]
  );

  const visibleCount = useMemo(() => {
    return dayTransactions.filter(
      (t) => timeToSeconds(t.time) <= playback.currentTimeSeconds
    ).length;
  }, [dayTransactions, playback.currentTimeSeconds]);

  // Track previous visible count for "new trade" flash
  const prevVisible = prevVisibleCountRef.current;
  useEffect(() => {
    prevVisibleCountRef.current = visibleCount;
  }, [visibleCount]);

  // Reset prev count when day changes
  useEffect(() => {
    prevVisibleCountRef.current = 0;
  }, [selectedDate]);

  // Loading state
  if (dayOptions === null) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 rounded-xl bg-card-bg border border-card-border animate-pulse"
          />
        ))}
      </div>
    );
  }

  // Empty state
  if (dayOptions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full gap-4 text-center p-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted-bg">
          <PlayCircle size={32} className="text-muted" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">No trades to replay</h2>
        <p className="text-sm text-muted max-w-sm">
          Import your trading data to replay your trading days.
        </p>
        <Link
          href="/import"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
        >
          <Upload size={16} />
          Import Trades
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header + day selector */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Day Replay</h1>
        <select
          value={selectedDate}
          onChange={(e) => {
            actions.reset();
            setSelectedDate(e.target.value);
          }}
          className="px-3 py-1.5 rounded-lg border border-card-border bg-card-bg text-foreground text-sm"
        >
          {dayOptions.map((opt) => (
            <option key={opt.date} value={opt.date}>
              {opt.formattedDate} ({opt.tradeCount} trades)
            </option>
          ))}
        </select>
      </div>

      {/* Stats */}
      <ReplayStats
        netPnL={currentSnapshot?.cumulativeNetPnL ?? 0}
        visibleCount={visibleCount}
        totalCount={dayTransactions.length}
        positions={currentSnapshot?.positions ?? []}
        currentTime={secondsToTime(playback.currentTimeSeconds)}
      />

      {/* Timeline */}
      <div className="rounded-xl border border-card-border bg-card-bg p-4">
        <ReplayTimeline
          transactions={dayTransactions}
          symbols={symbols}
          currentTimeSeconds={playback.currentTimeSeconds}
          startTimeSeconds={timeRange.start}
          endTimeSeconds={timeRange.end}
          snapshots={snapshots}
          prevVisibleCount={prevVisible}
          onSeek={actions.seek}
        />
      </div>

      {/* Controls */}
      <ReplayControls
        isPlaying={playback.isPlaying}
        speed={playback.speed}
        currentTimeSeconds={playback.currentTimeSeconds}
        startTimeSeconds={timeRange.start}
        endTimeSeconds={timeRange.end}
        onTogglePlay={actions.togglePlay}
        onSetSpeed={actions.setSpeed}
        onSeek={actions.seek}
        onReset={actions.reset}
        onSkipForward={actions.skipForward}
        onSkipBack={actions.skipBack}
      />
    </div>
  );
}

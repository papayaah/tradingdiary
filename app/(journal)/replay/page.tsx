'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Upload, PlayCircle, Info } from 'lucide-react';
import { getTransactionsByAccount } from '@/lib/db/trades';
import { getTradeDateCutoff } from '@/lib/settings';
import { aggregateByDay } from '@/lib/trading/aggregator';
import {
  timeToSeconds,
  secondsToTime,
  computePnLTimeline,
  findSnapshot,
  usePlaybackEngine,
  type PnLSnapshot,
} from '@/lib/replay/engine';
import type { TransactionRecord } from '@/lib/db/schema';
import ReplayTimeline from '@/components/replay/ReplayTimeline';
import ReplayControls from '@/components/replay/ReplayControls';
import ReplayStats from '@/components/replay/ReplayStats';
import ReplayChart from '@/components/replay/ReplayChart';
import { useAccount } from '@/contexts/AccountContext';

interface DayOption {
  date: string;
  formattedDate: string;
  tradeCount: number;
  transactions: TransactionRecord[];
}

export default function ReplayPage() {
  const { selectedAccountId } = useAccount();
  const searchParams = useSearchParams();
  const paramDate = searchParams.get('date');
  const paramSymbol = searchParams.get('symbol');

  const [allTransactions, setAllTransactions] = useState<TransactionRecord[]>([]);
  const [dayOptions, setDayOptions] = useState<DayOption[] | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [replayInterval, setReplayInterval] = useState('1m');
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
      setAllTransactions(transactions);

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
        const initialDate = paramDate && options.some(o => o.date === paramDate)
          ? paramDate
          : options[0].date;
        setSelectedDate(initialDate);
      }
    }
    load();
  }, [selectedAccountId, paramDate]);

  // Get selected day's data
  const selectedDay = dayOptions?.find((d) => d.date === selectedDate);

  const dayTransactions = useMemo(() => {
    if (!selectedDay) return [];
    let txns = [...selectedDay.transactions];

    // If a specific symbol was requested, isolate the replay to just that ticker
    if (paramSymbol) {
      txns = txns.filter(t => t.symbol === paramSymbol);
    }

    return txns.sort(
      (a, b) => timeToSeconds(a.time) - timeToSeconds(b.time)
    );
  }, [selectedDay, paramSymbol]);

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

  // ── Step 1: Compute Full P&L Timeline (all-time FIFO) ──
  const fullTimeline = useMemo(() => {
    // If a specific symbol is isolated, only calculate P&L for that ticker
    // otherwise it shows the whole portfolio's P&L which is confusing here.
    const relevantTxns = paramSymbol 
      ? allTransactions.filter(t => t.symbol === paramSymbol)
      : allTransactions;
    return computePnLTimeline(relevantTxns);
  }, [allTransactions, paramSymbol]);

  // ── Step 2: Extract Relevant Stats for Selected Day ──
  const snapshots = useMemo(() => {
    if (fullTimeline.length === 0) return [];
    
    // Relevant transactions sorted
    const relevantAll = (paramSymbol 
      ? allTransactions.filter(t => t.symbol === paramSymbol)
      : allTransactions
    ).sort((a, b) => a.date.localeCompare(b.date) || timeToSeconds(a.time) - timeToSeconds(b.time));
    
    // Find index of first trade of this day
    const firstIdx = relevantAll.findIndex(t => t.date === selectedDate);
    if (firstIdx === -1) return [];

    const baselinePnL = firstIdx > 0 ? computePnLTimeline(relevantAll.slice(0, firstIdx)).pop()?.cumulativeNetPnL ?? 0 : 0;

    // Filter snapshots that belong to this day
    const daySnapshots: PnLSnapshot[] = [];
    for (let i = firstIdx; i < relevantAll.length; i++) {
        if (relevantAll[i].date !== selectedDate) break;
        const s = fullTimeline[i];
        daySnapshots.push({
            ...s,
            cumulativeNetPnL: s.cumulativeNetPnL - baselinePnL
        });
    }
    return daySnapshots;
  }, [fullTimeline, allTransactions, selectedDate, paramSymbol]);

  const timeRange = useMemo(() => {
    if (dayTransactions.length === 0) return { start: 0, end: 0 };
    const times = dayTransactions.map((t) => timeToSeconds(t.time));
    const min = Math.min(...times);
    const max = Math.max(...times);
    // Add 5 min padding on each side
    return { start: Math.max(0, min - 300), end: Math.min(86400, max + 300) };
  }, [dayTransactions]);

  const [playback, actions] = usePlaybackEngine(
    timeRange.start,
    timeRange.end
  );

  // If replaying a specific symbol, jump to its start automatically
  useEffect(() => {
    if (paramSymbol && dayTransactions.length > 0 && playback.currentTimeSeconds === timeRange.start) {
      const firstTrade = timeToSeconds(dayTransactions[0].time);
      actions.seek(Math.max(timeRange.start, firstTrade - 120)); // Seek back 2 mins for context
    }
  }, [paramSymbol, dayTransactions, timeRange.start, actions, playback.currentTimeSeconds]);

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

  // Keyboard shortcut: Space to toggle play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        // Prevent scrolling and only toggle if not in an input
        if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
          actions.togglePlay();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions]);

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
        <div className="flex items-center gap-3">
          <select
            value={selectedDate}
            onChange={(e) => {
              actions.reset();
              setSelectedDate(e.target.value);
            }}
            className="px-3 py-1.5 rounded-lg border border-card-border bg-card-bg text-foreground text-sm font-medium"
          >
            {dayOptions.map((opt) => (
              <option key={opt.date} value={opt.date}>
                {opt.formattedDate} ({opt.tradeCount} trades)
              </option>
            ))}
          </select>

          {paramSymbol && (
            <Link
              href={`/replay?date=${selectedDate}`}
              className="text-[10px] uppercase font-bold text-accent bg-accent/10 px-2 py-1.5 rounded-lg hover:bg-accent hover:text-white transition-all flex items-center gap-1.5"
              title="Show all trades for this day"
            >
              Show Entire Session
            </Link>
          )}
        </div>
      </div>

      {paramSymbol && (
        <div className="flex items-center gap-2 px-4 py-2 bg-accent/5 border border-accent/20 rounded-xl text-xs text-accent font-medium">
          <Info size={14} />
          <span>Isolating trade: <strong>{paramSymbol}</strong>. Other session trades are hidden to focus on this execution path.</span>
        </div>
      )}

      {/* Stats */}
      <ReplayStats
        netPnL={currentSnapshot?.cumulativeNetPnL ?? 0}
        visibleCount={visibleCount}
        totalCount={dayTransactions.length}
        positions={currentSnapshot?.positions ?? []}
        currentTime={secondsToTime(playback.currentTimeSeconds)}
      />

      {/* Replay Chart (Candlesticks) */}
      {paramSymbol && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center gap-2">
              <Info size={12} className="text-accent" />
              Live Price Action Replay
            </h3>
            <div className="flex gap-1">
              {['1m', '5m', '10m', '15m'].map((iv) => (
                <button
                  key={iv}
                  onClick={() => setReplayInterval(iv)}
                  className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded transition-colors ${replayInterval === iv
                      ? 'bg-accent text-white'
                      : 'bg-muted/30 text-muted hover:text-foreground'
                    }`}
                >
                  {iv}
                </button>
              ))}
            </div>
          </div>
          <ReplayChart
            symbol={paramSymbol}
            date={selectedDate}
            transactions={dayTransactions}
            currentTimeSeconds={playback.currentTimeSeconds}
            interval={replayInterval}
            isPlaying={playback.isPlaying}
          />
        </div>
      )}

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

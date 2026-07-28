'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Upload, PlayCircle, Info, BarChart3, CalendarDays } from 'lucide-react';
import {
  timeToSeconds,
  secondsToTime,
  findSnapshot,
  usePlaybackEngine,
} from '@/lib/replay/engine';
import { computeRoundTrips, getRoundTripState } from '@/lib/replay/round-trips';
import ReplayTimeline from '@/components/replay/ReplayTimeline';
import ReplayControls from '@/components/replay/ReplayControls';
import ReplayStats from '@/components/replay/ReplayStats';
import ReplayChart from '@/components/replay/ReplayChart';
import FloatingTradePanel from '@/components/replay/FloatingTradePanel';
import { useReplaySession } from './useReplaySession';

export interface ReplayExperienceProps {
  date?: string | null;
  symbol?: string | null;
  initialInterval?: string;
  initialHeartbeat?: string;
}

export default function ReplayExperience({
  date,
  symbol,
  initialInterval = '1m',
  initialHeartbeat = '1m',
}: ReplayExperienceProps) {
  const [replayInterval, setReplayInterval] = useState(initialInterval);
  const [heartbeat, setHeartbeat] = useState(initialHeartbeat);
  const [showFloatingPanel, setShowFloatingPanel] = useState(true);
  const [panelSymbolOverride, setPanelSymbolOverride] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | undefined>();

  const {
    loading,
    empty,
    selectedDate,
    formattedDate,
    dayTransactions,
    symbols,
    snapshots,
    timeRange,
  } = useReplaySession(date, symbol);

  const [playback, actions] = usePlaybackEngine(
    timeRange.start,
    timeRange.end
  );

  // If replaying a specific symbol, jump to its start automatically
  useEffect(() => {
    if (symbol && dayTransactions.length > 0 && playback.currentTimeSeconds === timeRange.start) {
      const firstTrade = timeToSeconds(dayTransactions[0].time);
      actions.seek(Math.max(timeRange.start, firstTrade - 120)); // Seek back 2 mins for context
    }
  }, [symbol, dayTransactions, timeRange.start, actions, playback.currentTimeSeconds]);

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

  const selectedPanelSymbol = symbol
    ?? (panelSymbolOverride && symbols.includes(panelSymbolOverride)
      ? panelSymbolOverride
      : symbols[0] ?? null);

  // Compute round trips for the selected panel symbol
  const panelRoundTrips = useMemo(() => {
    if (!selectedPanelSymbol || dayTransactions.length === 0) return [];
    return computeRoundTrips(dayTransactions, selectedPanelSymbol);
  }, [dayTransactions, selectedPanelSymbol]);

  const roundTripState = useMemo(() => {
    if (panelRoundTrips.length === 0)
      return { completedTrips: [], activeTrip: null, dayNetPnL: 0 };
    return getRoundTripState(panelRoundTrips, playback.currentTimeSeconds);
  }, [panelRoundTrips, playback.currentTimeSeconds]);

  // Loading state
  if (loading) {
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
  if (empty) {
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
    <div className="w-full space-y-5 p-3 sm:space-y-6 sm:p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="mb-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">Trade Replay</h1>
          <p className="text-sm text-muted font-medium">Step through your trades bar-by-bar to improve execution.</p>
        </div>
        <div className="flex w-fit items-center gap-3 rounded-2xl border border-card-border bg-card-bg/50 px-4 py-3 shadow-sm backdrop-blur-sm">
          <CalendarDays size={16} className="text-accent" />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted">Replay session</div>
            <div className="text-xs font-bold text-foreground">
              {formattedDate ?? selectedDate}
              {symbol ? ` · ${symbol}` : ''}
            </div>
          </div>
        </div>
      </div>

      {symbol && (
        <div className="flex items-center gap-2 px-4 py-2 bg-accent/5 border border-accent/20 rounded-xl text-xs text-accent font-medium">
          <Info size={14} />
          <span>Replaying <strong>{symbol}</strong> from this journal entry. Other trades remain hidden so you can focus on this execution.</span>
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
      {symbol && (
        <div className="space-y-2">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <h3 className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center gap-2">
              <Info size={12} className="text-accent" />
              Live Price Action Replay
            </h3>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase font-bold text-muted-foreground whitespace-nowrap">Heartbeat</span>
                <div className="flex gap-1">
                  {['10s', '30s', '1m'].map((hb) => (
                    <button
                      key={hb}
                      onClick={() => setHeartbeat(hb)}
                      className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded transition-colors ${heartbeat === hb
                          ? 'bg-accent text-white'
                          : 'bg-muted/30 text-muted hover:text-foreground'
                        }`}
                    >
                      {hb}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-3 w-px bg-card-border" />

              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase font-bold text-muted-foreground whitespace-nowrap">Interval</span>
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
            </div>
          </div>
          <ReplayChart
            symbol={symbol}
            date={selectedDate}
            transactions={dayTransactions}
            currentTimeSeconds={playback.currentTimeSeconds}
            interval={replayInterval}
            heartbeat={heartbeat}
            isPlaying={playback.isPlaying}
            onCurrentPrice={setCurrentPrice}
          />
        </div>
      )}

      {/* Timeline */}
      <div className="overflow-x-auto rounded-2xl border border-card-border/50 bg-card-bg/40 p-3 shadow-sm backdrop-blur-md sm:p-6">
        <ReplayTimeline
          transactions={dayTransactions}
          symbols={symbols}
          currentTimeSeconds={playback.currentTimeSeconds}
          startTimeSeconds={timeRange.start}
          endTimeSeconds={timeRange.end}
          snapshots={snapshots}
          onSeek={actions.seek}
        />
      </div>

      {/* Controls */}
      <div className="sticky bottom-2 z-20 rounded-3xl border border-card-border/30 bg-background/90 p-1 shadow-xl backdrop-blur-xl sm:p-2">
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

      {/* Floating Round Trip Panel */}
      {showFloatingPanel && selectedPanelSymbol && panelRoundTrips.length > 0 && (
        <FloatingTradePanel
          symbol={selectedPanelSymbol}
          roundTrips={roundTripState.completedTrips}
          activeTrip={roundTripState.activeTrip}
          dayNetPnL={roundTripState.dayNetPnL}
          currentPrice={currentPrice}
          symbols={symbols.length > 1 ? symbols : undefined}
          onSymbolChange={symbols.length > 1 ? setPanelSymbolOverride : undefined}
          onClose={() => setShowFloatingPanel(false)}
        />
      )}

      {/* Panel re-open button */}
      {!showFloatingPanel && (
        <button
          onClick={() => setShowFloatingPanel(true)}
          className="fixed bottom-24 right-6 z-50 p-2.5 rounded-xl bg-accent text-white shadow-lg hover:bg-accent/90 transition-all hover:scale-105"
          title="Show Round Trips"
        >
          <BarChart3 size={18} />
        </button>
      )}
    </div>
  );
}

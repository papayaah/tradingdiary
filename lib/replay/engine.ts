'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { TransactionRecord } from '../db/schema';

// --- Utilities ---

export function timeToSeconds(time: string): number {
  const [h, m, s] = time.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

export function secondsToTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// --- P&L Timeline (pre-computed snapshots) ---

export interface PositionInfo {
  symbol: string;
  qty: number;
  side: 'LONG' | 'SHORT';
  avgCost: number;
}

export interface PnLSnapshot {
  timeSeconds: number;
  tradeIndex: number;
  cumulativeNetPnL: number;
  positions: PositionInfo[];
}

interface SymbolLot {
  qty: number;
  costPerShare: number;
  commission: number;
}

/**
 * Pre-compute cumulative P&L at each trade for the replay timeline.
 * Uses per-symbol FIFO matching (same logic as aggregator.ts).
 */
export function computePnLTimeline(transactions: TransactionRecord[]): PnLSnapshot[] {
  const sorted = [...transactions].sort(
    (a, b) => timeToSeconds(a.time) - timeToSeconds(b.time)
  );

  const symbolLots = new Map<string, SymbolLot[]>();
  const symbolNetQty = new Map<string, number>();
  let cumulativePnL = 0;
  const snapshots: PnLSnapshot[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const isOpening = t.side === 'BUYTOOPEN' || t.side === 'SELLTOOPEN';
    const qty = Math.abs(t.quantity);

    if (!symbolLots.has(t.symbol)) {
      symbolLots.set(t.symbol, []);
      symbolNetQty.set(t.symbol, 0);
    }

    const lots = symbolLots.get(t.symbol)!;
    const prevNetQty = symbolNetQty.get(t.symbol)!;

    if (isOpening) {
      lots.push({
        qty,
        costPerShare: Math.abs(t.totalValue) / qty,
        commission: t.commission,
      });
      // Commission on open reduces P&L
      cumulativePnL += t.commission;
    } else {
      // Closing — FIFO match
      let remaining = qty;
      const closePrice = Math.abs(t.totalValue) / qty;

      while (remaining > 0.001 && lots.length > 0) {
        const lot = lots[0];
        const matched = Math.min(remaining, lot.qty);

        const isLong = t.side === 'SELLTOCLOSE';
        if (isLong) {
          cumulativePnL += (closePrice - lot.costPerShare) * matched;
        } else {
          cumulativePnL += (lot.costPerShare - closePrice) * matched;
        }

        // Allocate opening commission proportionally
        const lotFraction = matched / (matched + (lot.qty - matched));
        // Opening commission already counted when lot was added

        lot.qty -= matched;
        remaining -= matched;

        if (lot.qty < 0.001) lots.shift();
      }

      // Closing commission
      cumulativePnL += t.commission;
    }

    // Update net quantity
    symbolNetQty.set(t.symbol, prevNetQty + t.quantity);

    // Build positions snapshot
    const positions: PositionInfo[] = [];
    for (const [sym, netQty] of symbolNetQty) {
      if (Math.abs(netQty) > 0.01) {
        const symLots = symbolLots.get(sym)!;
        const totalCost = symLots.reduce((s, l) => s + l.qty * l.costPerShare, 0);
        const totalQty = symLots.reduce((s, l) => s + l.qty, 0);
        positions.push({
          symbol: sym,
          qty: Math.abs(netQty),
          side: netQty > 0 ? 'LONG' : 'SHORT',
          avgCost: totalQty > 0.001 ? totalCost / totalQty : 0,
        });
      }
    }

    snapshots.push({
      timeSeconds: timeToSeconds(t.time),
      tradeIndex: i,
      cumulativeNetPnL: cumulativePnL,
      positions,
    });
  }

  return snapshots;
}

/**
 * Binary search for the last snapshot at or before the given time.
 */
export function findSnapshot(
  snapshots: PnLSnapshot[],
  timeSeconds: number
): PnLSnapshot | null {
  let lo = 0;
  let hi = snapshots.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (snapshots[mid].timeSeconds <= timeSeconds) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result >= 0 ? snapshots[result] : null;
}

// --- Playback Hook ---

const PLAYBACK_DURATION_1X = 60; // seconds of wall-clock for full day at 1x

export type PlaybackSpeed = 1 | 2 | 5 | 10;

export interface PlaybackState {
  currentTimeSeconds: number;
  isPlaying: boolean;
  speed: PlaybackSpeed;
}

export interface PlaybackActions {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setSpeed: (s: PlaybackSpeed) => void;
  seek: (timeSeconds: number) => void;
  reset: () => void;
  skipForward: () => void;
  skipBack: () => void;
}

export function usePlaybackEngine(
  startTimeSeconds: number,
  endTimeSeconds: number
): [PlaybackState, PlaybackActions] {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState<PlaybackSpeed>(1);
  const [currentTimeSeconds, setCurrentTimeSeconds] = useState(startTimeSeconds);

  const currentTimeRef = useRef(startTimeSeconds);
  const lastFrameRef = useRef(0);
  const lastRenderRef = useRef(0);
  const animFrameRef = useRef(0);
  const speedRef = useRef<PlaybackSpeed>(1);
  const isPlayingRef = useRef(false);

  const range = endTimeSeconds - startTimeSeconds;
  const compressionRatio = range > 0 ? range / PLAYBACK_DURATION_1X : 1;

  const tick = useCallback(
    (now: number) => {
      const delta = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;

      const clamped = Math.min(delta, 0.1);
      const advance = clamped * compressionRatio * speedRef.current;
      const next = Math.min(currentTimeRef.current + advance, endTimeSeconds);
      currentTimeRef.current = next;

      // Update React state at ~30fps
      if (now - lastRenderRef.current > 33) {
        setCurrentTimeSeconds(next);
        lastRenderRef.current = now;
      }

      if (next >= endTimeSeconds) {
        setCurrentTimeSeconds(endTimeSeconds);
        setIsPlaying(false);
        isPlayingRef.current = false;
        return;
      }

      animFrameRef.current = requestAnimationFrame(tick);
    },
    [compressionRatio, endTimeSeconds]
  );

  const play = useCallback(() => {
    if (isPlayingRef.current) return;
    // If at end, restart
    if (currentTimeRef.current >= endTimeSeconds) {
      currentTimeRef.current = startTimeSeconds;
      setCurrentTimeSeconds(startTimeSeconds);
    }
    isPlayingRef.current = true;
    setIsPlaying(true);
    lastFrameRef.current = performance.now();
    lastRenderRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(tick);
  }, [tick, endTimeSeconds, startTimeSeconds]);

  const pause = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) {
      pause();
    } else {
      play();
    }
  }, [play, pause]);

  const setSpeed = useCallback((s: PlaybackSpeed) => {
    speedRef.current = s;
    setSpeedState(s);
  }, []);

  const seek = useCallback((timeSeconds: number) => {
    const clamped = Math.max(startTimeSeconds, Math.min(timeSeconds, endTimeSeconds));
    currentTimeRef.current = clamped;
    setCurrentTimeSeconds(clamped);
  }, [startTimeSeconds, endTimeSeconds]);

  const reset = useCallback(() => {
    pause();
    currentTimeRef.current = startTimeSeconds;
    setCurrentTimeSeconds(startTimeSeconds);
  }, [pause, startTimeSeconds]);

  const skipForward = useCallback(() => {
    seek(currentTimeRef.current + 30 * compressionRatio);
  }, [seek, compressionRatio]);

  const skipBack = useCallback(() => {
    seek(currentTimeRef.current - 30 * compressionRatio);
  }, [seek, compressionRatio]);

  // Reset when time range changes (day switch)
  useEffect(() => {
    pause();
    currentTimeRef.current = startTimeSeconds;
    setCurrentTimeSeconds(startTimeSeconds);
  }, [startTimeSeconds, endTimeSeconds, pause]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return [
    { currentTimeSeconds, isPlaying, speed },
    { play, pause, togglePlay, setSpeed, seek, reset, skipForward, skipBack },
  ];
}

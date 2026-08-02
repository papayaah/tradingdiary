'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import PatternOverlay from '@/components/chart/PatternOverlay';
import {
  CandleData,
  detectAllPatterns,
  DetectedPattern,
  DoubleTopBottomResult,
  CupAndHandleResult,
  HeadAndShouldersResult,
} from '@/lib/chart/patterns';
import {
  DEFAULT_PATTERN_SETTINGS,
  scanAllPatterns,
  type PatternId,
  type PatternSettings,
} from '@/lib/scanner/patterns';
import type { TransactionRecord } from '@/lib/db/schema';
import { Loader2, Play } from 'lucide-react';

const DEFAULT_INTERVALS = ['1m', '5m', '10m', '15m', '1h', '1d'] as const;

// When the earliest loaded bar comes within this many bars of the visible left
// edge, ask the parent to page in older history. A little slack (not 0) means we
// prefetch just before the user hits the true edge, so panning feels seamless.
const LOAD_MORE_THRESHOLD_BARS = 25;

// On a fresh load, open on a recent window rather than fitting the entire
// history. Fitting everything squeezes bars against `minBarSpacing`, leaving no
// room to zoom out — which reads as "stuck". Opening zoomed-in gives room to
// zoom out (revealing loaded bars) and to reach the left edge (fetching more).
const DEFAULT_VISIBLE_BARS = 140;

export interface SharedTradingChartProps {
  symbol: string;
  date?: string;
  candles?: CandleData[];
  transactions?: TransactionRecord[];
  interval?: string;
  onIntervalChange?: (newInterval: string) => void;
  availableIntervals?: readonly string[];
  height?: number;
  showVolume?: boolean;
  autoPatternsEnabled?: boolean;
  onTogglePatterns?: () => void;
  onReplayTrade?: () => void;
  title?: string;
  subtitle?: string;
  providerBadge?: string;
  currentDayOnly?: boolean;
  onToggleCurrentDayOnly?: (val: boolean) => void;
  loading?: boolean;
  error?: string;
  selectedPatternId?: PatternId;
  minMovePercent?: number;
  requiredCount?: number;
  maxBodyOverlapPercent?: number;
  scannerPatternMarkersEnabled?: boolean;
  patternSettings?: PatternSettings;
  onLoadMoreHistory?: () => void;
  loadingMore?: boolean;
  hasMore?: boolean;
}

/**
 * Compute the UTC→ET offset in seconds for a given YYYYMMDD date string.
 */
function getETOffsetSeconds(dateStr: string): number {
  if (!dateStr || dateStr.length !== 8) return 0;
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  const refUTC = new Date(Date.UTC(year, month, day, 12, 0, 0));
  const etParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    hour: 'numeric',
  }).formatToParts(refUTC);
  const etHourAtNoonUTC = parseInt(etParts.find((p) => p.type === 'hour')?.value ?? '7');
  return (etHourAtNoonUTC - 12) * 3600;
}

function findClosestCandleTime(candles: CandleData[], transactionTime: string, dateStr?: string): number | null {
  if (!candles || candles.length === 0) return null;
  const parts = transactionTime.split(':').map(Number);
  if (parts.length < 2) return null;

  let targetSec: number;
  if (dateStr && dateStr.length === 8) {
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));
    const etOffset = getETOffsetSeconds(dateStr);
    const utcSec = Math.floor(Date.UTC(year, month, day, parts[0], parts[1], parts[2] || 0) / 1000);
    targetSec = utcSec + etOffset;
  } else {
    targetSec = parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
  }

  let closest = candles[0];
  let minDiff = Math.abs(candles[0].time - targetSec);

  for (let i = 1; i < candles.length; i++) {
    const diff = Math.abs(candles[i].time - targetSec);
    if (diff < minDiff) {
      minDiff = diff;
      closest = candles[i];
    }
  }

  return closest.time;
}

export default function SharedTradingChart({
  symbol,
  date,
  candles = [],
  transactions = [],
  interval = '5m',
  onIntervalChange,
  availableIntervals = DEFAULT_INTERVALS,
  height = 380,
  showVolume = true,
  autoPatternsEnabled = false,
  onTogglePatterns,
  onReplayTrade,
  title,
  subtitle,
  providerBadge,
  currentDayOnly = false,
  onToggleCurrentDayOnly,
  loading = false,
  error = '',
  selectedPatternId = 'consecutive',
  minMovePercent = 0.25,
  requiredCount = 3,
  maxBodyOverlapPercent = 100,
  scannerPatternMarkersEnabled = false,
  patternSettings = DEFAULT_PATTERN_SETTINGS,
  onLoadMoreHistory,
  loadingMore = false,
  hasMore = false,
}: SharedTradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const markersRef = useRef<{ setMarkers: (markers: SeriesMarker<Time>[]) => void } | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const patternSeriesRef = useRef<ISeriesApi<'Line'>[]>([]);

  // Data-diff tracking so we can tell a fresh dataset (→ fitContent) from an
  // older-history prepend (→ preserve the user's scroll position).
  const prevCountRef = useRef(0);
  const prevFirstTimeRef = useRef<number | null>(null);
  // Suppress load-more while WE move the time scale (setData/fit/restore) so only
  // genuine user pans trigger a fetch.
  const programmaticRangeRef = useRef(false);

  // Visible logical range, tracked (debounced) so auto-pattern detection can run
  // on only the candles currently on screen rather than the whole loaded set.
  const visibleRangeTimerRef = useRef<number | null>(null);
  const appliedRangeRef = useRef<{ from: number; to: number } | null>(null);
  const [visibleRange, setVisibleRange] = useState<{ from: number; to: number } | null>(null);

  // Mirror the latest infinite-scroll props into refs so the (once-only) range
  // subscription always sees current values without needing to resubscribe.
  const onLoadMoreRef = useRef(onLoadMoreHistory);
  const hasMoreRef = useRef(hasMore);
  const loadingMoreRef = useRef(loadingMore);
  useEffect(() => {
    onLoadMoreRef.current = onLoadMoreHistory;
    hasMoreRef.current = hasMore;
    loadingMoreRef.current = loadingMore;
  });

  const isDaily = interval === '1d' || interval === 'D';

  const formatCandleTime = useCallback(
    (timestamp: number): Time => {
      if (isDaily) {
        const d = new Date(timestamp * 1000);
        const yyyy = d.getUTCFullYear();
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(d.getUTCDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}` as Time;
      }
      return timestamp as Time;
    },
    [isDaily],
  );

  // Sorted & deduplicated candles used both for chart data and slicing the visible window.
  const sortedCandles = useMemo(() => {
    if (!candles || candles.length === 0) return [];
    const rawSorted = [...candles].sort((a, b) => a.time - b.time);
    const seen = new Set<string>();
    const result: typeof candles = [];
    for (const c of rawSorted) {
      const key = String(formatCandleTime(c.time));
      if (!seen.has(key)) {
        seen.add(key);
        result.push(c);
      }
    }
    return result;
  }, [candles, formatCandleTime]);

  // Candles currently within the viewport. Auto-pattern detection runs on THIS
  // subset — not the full loaded history — so the overlay reflects what the user
  // is actually looking at, not a formation from years back that's off-screen.
  const visibleCandles = useMemo(() => {
    const len = sortedCandles.length;
    if (len === 0) return sortedCandles;
    const from = visibleRange
      ? Math.max(0, Math.floor(visibleRange.from))
      : Math.max(0, len - DEFAULT_VISIBLE_BARS);
    const to = visibleRange ? Math.min(len, Math.ceil(visibleRange.to) + 1) : len;
    return from < to ? sortedCandles.slice(from, to) : sortedCandles;
  }, [sortedCandles, visibleRange]);

  // Active pattern derived from the VISIBLE candles + toggle (no extra render).
  const activePattern = useMemo<DetectedPattern | null>(() => {
    if (autoPatternsEnabled && visibleCandles.length > 5) {
      const scanResult = detectAllPatterns(visibleCandles);
      return scanResult.patterns.length > 0 ? scanResult.patterns[0] : null;
    }
    return null;
  }, [visibleCandles, autoPatternsEnabled]);

  // ── Effect A: create the chart + series ONCE per structural change ──────────
  // Rebuilding only on symbol/interval/height/volume (not on every candle
  // update) is what lets older bars stream in without the view resetting.
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#090d16' },
        textColor: '#94a3b8',
        fontFamily: 'var(--font-geist-sans), system-ui, -apple-system, sans-serif',
        fontSize: 11,
      },
      localization: {
        timeFormatter: (time: Time) => {
          if (typeof time === 'number') {
            const d = new Date(time * 1000);
            if (isDaily) {
              return d.toLocaleDateString('en-US', {
                timeZone: 'America/New_York',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });
            }
            const dateStr = d.toLocaleDateString('en-US', {
              timeZone: 'America/New_York',
              day: 'numeric',
              month: 'short',
              year: '2-digit',
            });
            const timeStr = d.toLocaleTimeString('en-US', {
              timeZone: 'America/New_York',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            });
            return `${dateStr} ${timeStr} ET`;
          }
          return String(time);
        },
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      crosshair: { mode: 0 },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        scaleMargins: {
          top: 0.12,
          bottom: showVolume ? 0.25 : 0.08,
        },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: !isDaily,
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => {
          if (typeof time === 'number') {
            const d = new Date(time * 1000);
            if (isDaily) {
              return d.toLocaleDateString('en-US', {
                timeZone: 'America/New_York',
                month: 'short',
                day: 'numeric',
              });
            }
            return d.toLocaleTimeString('en-US', {
              timeZone: 'America/New_York',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            });
          }
          return String(time);
        },
        // Keep candles readable: cap how tightly they pack so the view holds a
        // sane number of bars and the user scrolls horizontally for the rest,
        // rather than cramming thousands of microscopic candles into one screen.
        minBarSpacing: 2,
        // Don't let the user overscroll past the oldest loaded bar into empty
        // space — the left edge locks to the first candle. As older history
        // pages in, the edge extends left with it.
        fixLeftEdge: true,
      },
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        pressedMouseMove: true,
        mouseWheel: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderUpColor: '#10b981',
      borderDownColor: '#f43f5e',
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });
    candleSeriesRef.current = candleSeries;

    if (showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      volumeSeriesRef.current = volumeSeries;
    }

    // Fresh chart: reset diff-tracking + overlay bookkeeping so the first data
    // set fits content rather than being mistaken for a prepend. Also reset the
    // viewport tracking so pattern detection re-scopes to the new symbol/interval.
    prevCountRef.current = 0;
    prevFirstTimeRef.current = null;
    priceLinesRef.current = [];
    patternSeriesRef.current = [];
    markersRef.current = null;
    // Reset viewport dedup so the first range event after a rebuild re-scopes
    // pattern detection to the new symbol/interval (the debounced subscription
    // below updates visibleRange; no setState here to avoid cascading renders).
    appliedRangeRef.current = null;

    const timeScale = chart.timeScale();
    const onRangeChange = (range: { from: number; to: number } | null) => {
      if (!range) return;
      // Lazy-load older history when the user pans near the left edge — but only
      // on genuine user pans, not our own setData/fit/restore.
      if (
        !programmaticRangeRef.current &&
        range.from < LOAD_MORE_THRESHOLD_BARS &&
        hasMoreRef.current &&
        !loadingMoreRef.current
      ) {
        onLoadMoreRef.current?.();
      }
      // Scope auto-pattern detection to the viewport. Track ALL range changes
      // (incl. programmatic) so the detected pattern always matches what's on
      // screen. Debounced + de-duped so panning doesn't thrash re-renders.
      const rounded = { from: Math.round(range.from), to: Math.round(range.to) };
      const prev = appliedRangeRef.current;
      if (prev && prev.from === rounded.from && prev.to === rounded.to) return;
      appliedRangeRef.current = rounded;
      if (visibleRangeTimerRef.current !== null) {
        window.clearTimeout(visibleRangeTimerRef.current);
      }
      visibleRangeTimerRef.current = window.setTimeout(() => {
        setVisibleRange(rounded);
      }, 150);
    };
    timeScale.subscribeVisibleLogicalRangeChange(onRangeChange);

    const observer = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      timeScale.unsubscribeVisibleLogicalRangeChange(onRangeChange);
      if (visibleRangeTimerRef.current !== null) {
        window.clearTimeout(visibleRangeTimerRef.current);
        visibleRangeTimerRef.current = null;
      }
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      markersRef.current = null;
      priceLinesRef.current = [];
      patternSeriesRef.current = [];
    };
  }, [symbol, interval, height, showVolume, isDaily]);

  // ── Effect B1: push candle/volume DATA + position the view ──────────────────
  // Runs only when candle data changes — not on pattern/overlay changes — so
  // recomputing the in-view pattern never resets the user's scroll/zoom.
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries) return;
    if (sortedCandles.length === 0) return;

    // We are about to move the time scale; suppress the load-more trigger until
    // the next frame so these programmatic changes don't self-fire.
    programmaticRangeRef.current = true;

    // Detect an older-history prepend: more bars than before, and the new first
    // bar is older than the previous first bar.
    const oldCount = prevCountRef.current;
    const oldFirst = prevFirstTimeRef.current;
    const newFirst = sortedCandles[0].time;
    const isPrepend =
      oldCount > 0 &&
      sortedCandles.length > oldCount &&
      oldFirst !== null &&
      newFirst < oldFirst;
    const savedRange = isPrepend ? chart.timeScale().getVisibleLogicalRange() : null;

    candleSeries.setData(
      sortedCandles.map((c) => ({
        time: formatCandleTime(c.time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.setData(
        sortedCandles.map((c) => ({
          time: formatCandleTime(c.time),
          value: c.volume ?? 0,
          color:
            c.close >= c.open
              ? 'rgba(16, 185, 129, 0.25)'
              : 'rgba(244, 63, 94, 0.25)',
        })),
      );
    }

    // Preserve the user's scroll position on a prepend; on a fresh dataset open
    // on a recent window (with room to zoom out) rather than fitting everything.
    if (isPrepend && savedRange) {
      const delta = sortedCandles.length - oldCount;
      chart.timeScale().setVisibleLogicalRange({
        from: savedRange.from + delta,
        to: savedRange.to + delta,
      });
    } else if (sortedCandles.length > DEFAULT_VISIBLE_BARS) {
      chart.timeScale().setVisibleLogicalRange({
        from: sortedCandles.length - DEFAULT_VISIBLE_BARS,
        to: sortedCandles.length + 2,
      });
    } else {
      chart.timeScale().fitContent();
    }

    prevCountRef.current = sortedCandles.length;
    prevFirstTimeRef.current = newFirst;

    // Re-enable user-driven load-more after this batch of programmatic changes.
    const raf = requestAnimationFrame(() => {
      programmaticRangeRef.current = false;
    });
    return () => cancelAnimationFrame(raf);
  }, [sortedCandles, formatCandleTime]);

  // ── Effect B2: draw overlays (markers, price lines, pattern geometry) ────────
  // Runs on data OR pattern changes; never touches the time scale, so the
  // in-view pattern can recompute as the user pans without moving the view.
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries) return;
    if (sortedCandles.length === 0) return;

    // Clear overlays from the previous render before rebuilding them.
    priceLinesRef.current.forEach((line) => candleSeries.removePriceLine(line));
    priceLinesRef.current = [];
    patternSeriesRef.current.forEach((series) => chart.removeSeries(series));
    patternSeriesRef.current = [];

    const markers: SeriesMarker<Time>[] = [];

    // 1. Transaction Execution Markers (from Journal/Portfolio)
    if (transactions && transactions.length > 0) {
      const seenPriceLines = new Set<string>();
      transactions.forEach((t) => {
        const tradeTime = findClosestCandleTime(sortedCandles, t.time, date);
        if (tradeTime !== null) {
          const isBuy = t.side === 'BUYTOOPEN' || t.side === 'BUYTOCLOSE';
          markers.push({
            time: formatCandleTime(tradeTime),
            position: isBuy ? 'belowBar' : 'aboveBar',
            color: isBuy ? '#4ade80' : '#f87171',
            shape: isBuy ? 'arrowUp' : 'arrowDown',
            text: `${isBuy ? 'B' : 'S'} ${Math.abs(t.quantity)}`,
          });
        }
        if (typeof t.price === 'number' && isFinite(t.price) && t.price > 0) {
          const isBuy = t.side === 'BUYTOOPEN' || t.side === 'BUYTOCLOSE';
          const key = `${isBuy ? 'B' : 'S'}-${t.price.toFixed(2)}`;
          if (!seenPriceLines.has(key)) {
            seenPriceLines.add(key);
            priceLinesRef.current.push(
              candleSeries.createPriceLine({
                price: t.price,
                color: isBuy ? '#4ade80' : '#f87171',
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                axisLabelVisible: true,
                title: isBuy ? 'Buy' : 'Sell',
              }),
            );
          }
        }
      });
    }

    // 1.5 Scanner detector markers. These are separate from the optional
    // chart-formation overlays controlled by `autoPatternsEnabled`.
    if (scannerPatternMarkersEnabled) {
      const detectorMatches = scanAllPatterns(
        sortedCandles.map((candle) => ({
          ...candle,
          volume: candle.volume ?? 0,
        })),
        minMovePercent,
        requiredCount,
        selectedPatternId,
        maxBodyOverlapPercent,
        patternSettings,
      );

      detectorMatches.forEach((m) => {
        const isBull = m.type === 'bullish';
        markers.push({
          time: formatCandleTime(m.time),
          position: isBull ? 'belowBar' : 'aboveBar',
          color: isBull ? '#10b981' : '#f43f5e',
          shape: isBull ? 'arrowUp' : 'arrowDown',
        });
      });
    }

    // 2. Auto Pattern Overlay Geometry Lines & Breakout / Target Lines
    if (autoPatternsEnabled && activePattern) {
      priceLinesRef.current.push(
        candleSeries.createPriceLine({
          price: activePattern.breakoutPrice,
          color: '#f59e0b',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `Breakout: $${activePattern.breakoutPrice.toFixed(2)}`,
        }),
        candleSeries.createPriceLine({
          price: activePattern.targetPrice,
          color: '#10b981',
          lineWidth: 2,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `Target: $${activePattern.targetPrice.toFixed(2)}`,
        }),
        candleSeries.createPriceLine({
          price: activePattern.stopLossPrice,
          color: '#f43f5e',
          lineWidth: 1,
          lineStyle: LineStyle.LargeDashed,
          axisLabelVisible: true,
          title: `Stop: $${activePattern.stopLossPrice.toFixed(2)}`,
        }),
      );

      if (activePattern.name === 'Double Bottom (W)' || activePattern.name === 'Double Top (M)') {
        const res = activePattern as DoubleTopBottomResult;
        const lineSeries = chart.addSeries(LineSeries, {
          color: res.type === 'bullish' ? '#38bdf8' : '#fbbf24',
          lineWidth: 4,
          lineStyle: LineStyle.Solid,
        });
        lineSeries.setData([
          { time: formatCandleTime(res.firstPivot.time), value: res.firstPivot.price },
          { time: formatCandleTime(res.middlePivot.time), value: res.middlePivot.price },
          { time: formatCandleTime(res.secondPivot.time), value: res.secondPivot.price },
        ]);
        patternSeriesRef.current.push(lineSeries);
        markers.push(
          {
            time: formatCandleTime(res.firstPivot.time),
            position: res.type === 'bullish' ? 'belowBar' : 'aboveBar',
            color: res.type === 'bullish' ? '#38bdf8' : '#f43f5e',
            shape: 'circle',
            text: '①',
          },
          {
            time: formatCandleTime(res.middlePivot.time),
            position: res.type === 'bullish' ? 'aboveBar' : 'belowBar',
            color: '#f59e0b',
            shape: 'circle',
            text: '②',
          },
          {
            time: formatCandleTime(res.secondPivot.time),
            position: res.type === 'bullish' ? 'belowBar' : 'aboveBar',
            color: res.type === 'bullish' ? '#38bdf8' : '#f43f5e',
            shape: 'circle',
            text: '③',
          },
        );
      } else if (activePattern.name === 'Cup & Handle') {
        const res = activePattern as CupAndHandleResult;
        const lineSeries = chart.addSeries(LineSeries, {
          color: '#38bdf8',
          lineWidth: 3,
        });
        lineSeries.setData([
          { time: formatCandleTime(res.leftRim.time), value: res.leftRim.price },
          { time: formatCandleTime(res.bottom.time), value: res.bottom.price },
          { time: formatCandleTime(res.rightRim.time), value: res.rightRim.price },
        ]);
        patternSeriesRef.current.push(lineSeries);
        markers.push(
          {
            time: formatCandleTime(res.leftRim.time),
            position: 'aboveBar',
            color: '#38bdf8',
            shape: 'circle',
            text: '① Left Rim',
          },
          {
            time: formatCandleTime(res.bottom.time),
            position: 'belowBar',
            color: '#38bdf8',
            shape: 'circle',
            text: '② Cup Bottom',
          },
          {
            time: formatCandleTime(res.rightRim.time),
            position: 'aboveBar',
            color: '#38bdf8',
            shape: 'circle',
            text: '③ Right Rim',
          },
        );
      } else if (activePattern.name === 'Head & Shoulders' || activePattern.name === 'Inverse Head & Shoulders') {
        const res = activePattern as HeadAndShouldersResult;
        // 1. Peak & Trough Outline (Left Shoulder -> Trough 1 -> Head -> Trough 2 -> Right Shoulder)
        const lineSeries = chart.addSeries(LineSeries, {
          color: res.type === 'bearish' ? '#ec4899' : '#10b981',
          lineWidth: 3,
        });

        lineSeries.setData([
          { time: formatCandleTime(res.leftShoulder.time), value: res.leftShoulder.price },
          { time: formatCandleTime(res.trough1.time), value: res.trough1.price },
          { time: formatCandleTime(res.head.time), value: res.head.price },
          { time: formatCandleTime(res.trough2.time), value: res.trough2.price },
          { time: formatCandleTime(res.rightShoulder.time), value: res.rightShoulder.price },
        ]);
        patternSeriesRef.current.push(lineSeries);

        // 2. Neckline (connecting Trough 1 and Trough 2)
        const necklineSeries = chart.addSeries(LineSeries, {
          color: '#f59e0b',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
        });

        necklineSeries.setData([
          { time: formatCandleTime(res.trough1.time), value: res.trough1.price },
          { time: formatCandleTime(res.trough2.time), value: res.trough2.price },
        ]);
        patternSeriesRef.current.push(necklineSeries);

        markers.push(
          {
            time: formatCandleTime(res.leftShoulder.time),
            position: res.type === 'bearish' ? 'aboveBar' : 'belowBar',
            color: '#ec4899',
            shape: 'circle',
            text: '① Left Shoulder',
          },
          {
            time: formatCandleTime(res.head.time),
            position: res.type === 'bearish' ? 'aboveBar' : 'belowBar',
            color: '#ec4899',
            shape: 'circle',
            text: '② Head',
          },
          {
            time: formatCandleTime(res.rightShoulder.time),
            position: res.type === 'bearish' ? 'aboveBar' : 'belowBar',
            color: '#ec4899',
            shape: 'circle',
            text: '③ Right Shoulder',
          },
        );
      }
    }

    const markerTimeSec = (t: Time): number => {
      if (typeof t === 'number') return t;
      if (typeof t === 'string') {
        const parsed = Date.parse(t);
        if (!isNaN(parsed)) return parsed / 1000;
      }
      return 0;
    };

    const sortedMarkers = [...markers].sort((a, b) => markerTimeSec(a.time) - markerTimeSec(b.time));
    if (markersRef.current) {
      markersRef.current.setMarkers(sortedMarkers);
    } else {
      markersRef.current = createSeriesMarkers(candleSeries, sortedMarkers);
    }
  }, [
    sortedCandles,
    activePattern,
    autoPatternsEnabled,
    transactions,
    date,
    formatCandleTime,
    selectedPatternId,
    minMovePercent,
    requiredCount,
    maxBodyOverlapPercent,
    scannerPatternMarkersEnabled,
    patternSettings,
  ]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-card-border bg-[#090d16] shadow-2xl flex flex-col">
      {/* Top Chart Header & Timeline Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-3 gap-3 border-b border-card-border/50 bg-[#0c121e]/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent shadow-inner">
            <span className="text-xs font-black uppercase">{symbol.substring(0, 1)}</span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-foreground tracking-tight">{title || `${symbol} Candlestick Chart`}</span>
              {providerBadge && (
                <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-card-bg text-muted border border-card-border rounded-md">
                  {providerBadge}
                </span>
              )}
            </div>
            {subtitle && (
              <span className="text-[10px] font-medium text-muted">{subtitle}</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Current Day Filter Toggle */}
          {onToggleCurrentDayOnly && (
            <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer hover:text-foreground transition-colors mr-1">
              <input
                type="checkbox"
                checked={currentDayOnly}
                onChange={(e) => onToggleCurrentDayOnly(e.target.checked)}
                className="rounded border-card-border bg-card-bg text-accent focus:ring-accent accent-accent"
              />
              Current Day Only
            </label>
          )}

          {/* Replay Trade Button */}
          {onReplayTrade && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onReplayTrade();
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-accent/10 text-accent hover:bg-accent hover:text-white rounded-lg transition-all"
            >
              <Play size={10} fill="currentColor" />
              Replay
            </button>
          )}

          {/* Timeframe / Interval Toolbar Pills */}
          {onIntervalChange && availableIntervals.length > 0 && (
            <div
              className="flex items-center gap-1 bg-muted-bg/50 p-1 rounded-xl border border-card-border/40"
              title="Candlestick Bar Interval (Bar Resolution)"
            >
              {availableIntervals.map((iv) => (
                <button
                  key={iv}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onIntervalChange(iv);
                  }}
                  className={`px-2 py-0.5 text-[10px] font-black uppercase rounded-lg transition-all ${
                    interval === iv
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-muted hover:text-foreground hover:bg-card-bg/60'
                  }`}
                >
                  {iv}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Floating Auto Patterns Toggle & Details Badge — scoped to the viewport */}
      <PatternOverlay
        candles={visibleCandles}
        enabled={autoPatternsEnabled}
        onToggleEnabled={onTogglePatterns}
      />

      {/* Chart Canvas Area */}
      <div className="relative w-full">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#090d16]/80 backdrop-blur-sm">
            <Loader2 className="w-6 h-6 text-accent animate-spin" />
          </div>
        )}

        {/* Left-edge history loader / start-of-history marker */}
        {onLoadMoreHistory && (loadingMore || !hasMore) && (
          <div className="absolute left-2 top-2 z-20">
            {loadingMore ? (
              <span className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold text-muted bg-[#0c121e]/90 border border-card-border rounded-lg backdrop-blur-sm">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading older history…
              </span>
            ) : (
              <span className="px-2 py-1 text-[10px] font-semibold text-muted/70 bg-[#0c121e]/80 border border-card-border/60 rounded-lg backdrop-blur-sm">
                Earliest loaded · scroll to view
              </span>
            )}
          </div>
        )}

        {error ? (
          <div className="flex items-center justify-center w-full" style={{ height }}>
            <span className="text-xs text-rose-400 font-medium">{error}</span>
          </div>
        ) : (
          <div ref={containerRef} className="w-full" style={{ height }} />
        )}
      </div>
    </div>
  );
}

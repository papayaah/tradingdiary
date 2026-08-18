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
  type ISeriesPrimitive,
  type IPrimitivePaneView,
  type IPrimitivePaneRenderer,
  type PrimitivePaneViewZOrder,
  type SeriesAttachedParameter,
} from 'lightweight-charts';
import PatternOverlay from '@/components/chart/PatternOverlay';
import { displaySymbol } from '@/lib/utils/format';
import {
  CandleData,
  detectAllPatterns,
  DetectedPattern,
  DoubleTopBottomResult,
  CupAndHandleResult,
  HeadAndShouldersResult,
  detectMarketStructure,
} from '@/lib/chart/patterns';
import {
  DEFAULT_PATTERN_SETTINGS,
  scanAllPatterns,
  type PatternId,
  type PatternSettings,
} from '@/lib/scanner/patterns';
import type { TransactionRecord } from '@/lib/db/schema';
import { CalendarDays, ChartNoAxesCombined, Loader2, Minus, Play, Sparkles } from 'lucide-react';
const DEFAULT_INTERVALS = ['1m', '5m', '10m', '15m', '1h', '1d'] as const;
const LOAD_MORE_THRESHOLD_BARS = 25;
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
  levelsEnabled?: boolean;
  onToggleLevels?: () => void;
  trendlinesEnabled?: boolean;
  onToggleTrendlines?: () => void;
  showOverlayControls?: boolean;
  onReplayTrade?: () => void;
  title?: string;
  subtitle?: string;
  providerBadge?: string;
  showChartIdentity?: boolean;
  showSymbolIcon?: boolean;
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
  flat?: boolean;
}

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
    targetSec = Math.floor(Date.UTC(year, month, day, parts[0], parts[1], parts[2] || 0) / 1000);
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

function drawMetaTraderArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isBuy: boolean,
  color: string,
  barWidth: number = 8,
  isHovered: boolean = false,
  isDark: boolean = true
) {
  const arrowWidth = Math.max(4, Math.min(11, Math.round(barWidth * 0.7)));
  const arrowHeight = Math.max(5, Math.min(13, Math.round(barWidth * 0.85)));
  const halfW = arrowWidth / 2;
  const halfH = arrowHeight / 2;
  const notch = 2; // depth of the arrow's tail flag

  // Halo contrasts the arrow against the candle behind it: light outline on the
  // dark theme, dark outline on the light theme, so it reads in both.
  const halo = isDark
    ? (isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.95)')
    : (isHovered ? '#0f172a' : 'rgba(15, 23, 42, 0.9)');

  const buildPath = () => {
    ctx.beginPath();
    if (isBuy) {
      ctx.moveTo(x, y - halfH);
      ctx.lineTo(x + halfW, y + halfH);
      ctx.lineTo(x + halfW / 2, y + halfH);
      ctx.lineTo(x + halfW / 2, y + halfH + notch);
      ctx.lineTo(x - halfW / 2, y + halfH + notch);
      ctx.lineTo(x - halfW / 2, y + halfH);
      ctx.lineTo(x - halfW, y + halfH);
    } else {
      ctx.moveTo(x, y + halfH);
      ctx.lineTo(x + halfW, y - halfH);
      ctx.lineTo(x + halfW / 2, y - halfH);
      ctx.lineTo(x + halfW / 2, y - halfH - notch);
      ctx.lineTo(x - halfW / 2, y - halfH - notch);
      ctx.lineTo(x - halfW / 2, y - halfH);
      ctx.lineTo(x - halfW, y - halfH);
    }
    ctx.closePath();
  };

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Subtle drop shadow lifts the arrow off same-colored candles behind it.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;

  // 1) Halo outline — high contrast against both green and red candles.
  buildPath();
  ctx.strokeStyle = halo;
  ctx.lineWidth = isHovered ? 3 : 2;
  ctx.stroke();

  // 2) Solid fill (shadow already applied by the halo stroke; drop it here so
  //    the fill sits crisp inside the outline).
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  buildPath();
  ctx.fillStyle = color;
  ctx.fill();

  // 3) Thin darker edge for definition.
  ctx.strokeStyle = isBuy ? '#047857' : '#b91c1c';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (isHovered) {
    ctx.beginPath();
    ctx.arc(x, y, halfW + 3, 0, Math.PI * 2);
    ctx.strokeStyle = halo;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.restore();
}

export class TradeExecutionPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<'Candlestick'> | null = null;
  private _transactions: TransactionRecord[] = [];
  private _sortedCandles: CandleData[] = [];
  private _date?: string;
  private _formatCandleTime: (t: number) => Time;
  private _isDark: boolean = true;
  private _hovered: { time: string; price: number } | null = null;
  private _paneViews: readonly IPrimitivePaneView[];
  private _requestUpdate?: () => void;

  constructor(formatCandleTime: (t: number) => Time, isDark: boolean) {
    this._formatCandleTime = formatCandleTime;
    this._isDark = isDark;
    this._paneViews = [new TradeExecutionPaneView(this)];
  }

  get chart() { return this._chart; }
  get series() { return this._series; }
  get transactions() { return this._transactions; }
  get sortedCandles() { return this._sortedCandles; }
  get date() { return this._date; }
  get formatCandleTime() { return this._formatCandleTime; }
  get isDark() { return this._isDark; }
  get hovered() { return this._hovered; }

  attached(param: SeriesAttachedParameter<Time>) {
    this._chart = param.chart;
    this._series = param.series as ISeriesApi<'Candlestick'>;
    this._requestUpdate = param.requestUpdate;
  }

  detached() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = undefined;
  }

  update(transactions: TransactionRecord[], sortedCandles: CandleData[], date?: string, isDark?: boolean) {
    this._transactions = transactions;
    this._sortedCandles = sortedCandles;
    this._date = date;
    if (isDark !== undefined) this._isDark = isDark;
    this._requestUpdate?.();
  }

  setHovered(hovered: { time: string; price: number } | null) {
    this._hovered = hovered;
    this._requestUpdate?.();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }
}

class TradeExecutionPaneView implements IPrimitivePaneView {
  private _primitive: TradeExecutionPrimitive;

  constructor(primitive: TradeExecutionPrimitive) {
    this._primitive = primitive;
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer | null {
    return new TradeExecutionPaneRenderer(this._primitive);
  }
}

class TradeExecutionPaneRenderer implements IPrimitivePaneRenderer {
  private _primitive: TradeExecutionPrimitive;

  constructor(primitive: TradeExecutionPrimitive) {
    this._primitive = primitive;
  }

  draw(target: Parameters<IPrimitivePaneRenderer['draw']>[0]) {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const chart = this._primitive.chart;
      const series = this._primitive.series;
      if (!chart || !series) return;

      const timeScale = chart.timeScale();
      const transactions = this._primitive.transactions;
      const sortedCandles = this._primitive.sortedCandles;
      if (!transactions || transactions.length === 0 || sortedCandles.length === 0) return;

      const mediaSize = scope.mediaSize;
      const width = mediaSize.width;
      const height = mediaSize.height;

      let barWidth = 8;
      if (sortedCandles.length >= 2) {
        const x0 = timeScale.timeToCoordinate(this._primitive.formatCandleTime(sortedCandles[0].time));
        const x1 = timeScale.timeToCoordinate(this._primitive.formatCandleTime(sortedCandles[1].time));
        if (x0 !== null && x1 !== null) {
          barWidth = Math.abs(x1 - x0);
        }
      }

      transactions.forEach((t) => {
        const tradeTime = findClosestCandleTime(sortedCandles, t.time, this._primitive.date);
        if (tradeTime === null) return;

        const timeFormatted = this._primitive.formatCandleTime(tradeTime);
        const x = timeScale.timeToCoordinate(timeFormatted);
        if (x === null || x < 0 || x > width) return;

        let y: number | null = null;
        if (typeof t.price === 'number' && isFinite(t.price) && t.price > 0) {
          y = series.priceToCoordinate(t.price);
        }

        // Anchor to the candle at this time when the trade price is missing OR
        // falls outside the visible range — otherwise the arrow would be skipped
        // (e.g. placeholder/demo prices, or a fill outside the fetched candles).
        if (y === null || y < 0 || y > height) {
          const matchedCandle = sortedCandles.find((c) => c.time === tradeTime);
          if (matchedCandle) {
            y = series.priceToCoordinate(matchedCandle.close);
          }
        }

        if (y === null || y < 0 || y > height) return;

        const isBuy = t.side === 'BUYTOOPEN' || t.side === 'BUYTOCLOSE';
        const color = isBuy
          ? (this._primitive.isDark ? '#4ade80' : '#16a34a')
          : (this._primitive.isDark ? '#f87171' : '#dc2626');

        const hv = this._primitive.hovered;
        const isHovered = hv !== null && hv.time === t.time && hv.price === t.price;

        drawMetaTraderArrow(ctx, x, y, isBuy, color, barWidth, isHovered, this._primitive.isDark);
      });
    });
  }
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
  levelsEnabled: controlledLevelsEnabled,
  onToggleLevels,
  trendlinesEnabled: controlledTrendlinesEnabled,
  onToggleTrendlines,
  showOverlayControls = true,
  onReplayTrade,
  title,
  subtitle,
  providerBadge,
  showChartIdentity = true,
  showSymbolIcon = true,
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
  flat = false,
}: SharedTradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const markersRef = useRef<{ setMarkers: (markers: SeriesMarker<Time>[]) => void } | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const patternSeriesRef = useRef<ISeriesApi<'Line'>[]>([]);
  const primitiveRef = useRef<TradeExecutionPrimitive | null>(null);
  const [localLevelsEnabled, setLocalLevelsEnabled] = useState(true);
  const [localTrendlinesEnabled, setLocalTrendlinesEnabled] = useState(true);
  const levelsEnabled = controlledLevelsEnabled ?? localLevelsEnabled;
  const trendlinesEnabled = controlledTrendlinesEnabled ?? localTrendlinesEnabled;
  const handleToggleLevels = useCallback(() => {
    if (onToggleLevels) {
      onToggleLevels();
      return;
    }
    setLocalLevelsEnabled((enabled) => !enabled);
  }, [onToggleLevels]);
  const handleToggleTrendlines = useCallback(() => {
    if (onToggleTrendlines) {
      onToggleTrendlines();
      return;
    }
    setLocalTrendlinesEnabled((enabled) => !enabled);
  }, [onToggleTrendlines]);
  const [hoveredTrade, setHoveredTrade] = useState<{
    trade: TransactionRecord;
    x: number;
    y: number;
    isBuy: boolean;
  } | null>(null);

  // System Theme (Light vs Dark) detection for Chart background and scales
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkTheme = () => {
      const isDarkTheme = document.documentElement.classList.contains('dark') || window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDark(isDarkTheme);
    };
    checkTheme();

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mediaQuery.addEventListener('change', handleMediaChange);

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      mediaQuery.removeEventListener('change', handleMediaChange);
      observer.disconnect();
    };
  }, []);

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
  const canLoadOlderHistory = Boolean(onLoadMoreHistory);

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

  // The candle-index span covered by the trade's executions (first fill → last
  // fill). Used to frame the initial view on the trade rather than the whole day
  // so a 3-candle scalp isn't lost in a 140-candle session. Null when there are
  // no executions (e.g. the scanner chart) → falls back to the default framing.
  const tradeExecutionSpan = useMemo(() => {
    if (!transactions || transactions.length === 0 || sortedCandles.length === 0) return null;
    const times = transactions
      .map((t) => findClosestCandleTime(sortedCandles, t.time, date))
      .filter((t): t is number => t !== null);
    if (times.length === 0) return null;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const firstIdx = sortedCandles.findIndex((c) => c.time === minTime);
    const lastIdx = sortedCandles.findIndex((c) => c.time === maxTime);
    if (firstIdx < 0 || lastIdx < 0) return null;
    return { firstIdx, lastIdx };
  }, [transactions, sortedCandles, date]);

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

  const marketStructure = useMemo(
    () => levelsEnabled || trendlinesEnabled
      ? detectMarketStructure(visibleCandles)
      : { levels: [], trendlines: [] },
    [visibleCandles, levelsEnabled, trendlinesEnabled],
  );

  // Execution arrows are drawn by the TradeExecutionPrimitive inside the chart's
  // own render loop, so they stay pinned to their candle through any X/Y zoom or
  // scale change — no separate overlay canvas to fall out of sync. We only feed
  // it the hovered execution so it can highlight that one arrow.
  useEffect(() => {
    primitiveRef.current?.setHovered(
      hoveredTrade ? { time: hoveredTrade.trade.time, price: hoveredTrade.trade.price } : null
    );
  }, [hoveredTrade]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!transactions || transactions.length === 0 || !containerRef.current || !chartRef.current || !candleSeriesRef.current) {
        if (hoveredTrade) setHoveredTrade(null);
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const timeScale = chartRef.current.timeScale();
      const candleSeries = candleSeriesRef.current;

      let foundHover: { trade: TransactionRecord; x: number; y: number; isBuy: boolean } | null = null;
      let minDistance = 14;

      for (const t of transactions) {
        const tradeTime = findClosestCandleTime(sortedCandles, t.time, date);
        if (tradeTime === null) continue;

        const x = timeScale.timeToCoordinate(formatCandleTime(tradeTime));
        if (x === null || x < 0 || x > rect.width) continue;

        let y: number | null = null;
        if (typeof t.price === 'number' && isFinite(t.price) && t.price > 0) {
          y = candleSeries.priceToCoordinate(t.price);
        }

        if (y === null || y < 0 || y > rect.height) continue;

        const dist = Math.hypot(mouseX - x, mouseY - y);
        if (dist < minDistance) {
          minDistance = dist;
          const isBuy = t.side === 'BUYTOOPEN' || t.side === 'BUYTOCLOSE';
          foundHover = { trade: t, x, y, isBuy };
        }
      }

      setHoveredTrade(foundHover);
    },
    [transactions, sortedCandles, date, formatCandleTime, hoveredTrade]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredTrade(null);
  }, []);

  // ── Effect A: create the chart + series ONCE per structural change ──────────
  // Rebuilding only on symbol/interval/height/volume (not on every candle
  // update) is what lets older bars stream in without the view resetting.
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const bgColor = isDark ? '#090d16' : '#ffffff';
    const textColor = isDark ? '#94a3b8' : '#334155';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)';
    const borderColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: bgColor },
        textColor,
        fontFamily: 'var(--font-geist-sans), system-ui, -apple-system, sans-serif',
        fontSize: 13,
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
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: { mode: 0 },
      rightPriceScale: {
        borderColor,
        scaleMargins: {
          top: 0.12,
          bottom: showVolume ? 0.25 : 0.08,
        },
      },
      timeScale: {
        borderColor,
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
        // Finite/current-day charts have no older candles to fetch, so prevent
        // zooming into misleading empty logical time. History-enabled charts
        // keep the left edge open so a left pan can trigger the loader.
        fixLeftEdge: !canLoadOlderHistory,
        // There is never meaningful future data to reveal by overscrolling.
        fixRightEdge: true,
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

    const primitive = new TradeExecutionPrimitive(formatCandleTime, isDark);
    candleSeries.attachPrimitive(primitive);
    primitiveRef.current = primitive;

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
      if (primitiveRef.current && candleSeriesRef.current) {
        candleSeriesRef.current.detachPrimitive(primitiveRef.current);
        primitiveRef.current = null;
      }
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
  }, [symbol, interval, height, showVolume, isDaily, isDark, canLoadOlderHistory]);

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
    // Any refresh of the current dataset must preserve the user's chosen zoom.
    // Parent polling often supplies a new array even when its candles are
    // unchanged; treating that as a fresh dataset causes fitContent() to snap
    // the chart back shortly after a zoom or pan. Genuine symbol/interval
    // changes rebuild the chart and reset oldCount to zero.
    const savedRange = oldCount > 0 ? chart.timeScale().getVisibleLogicalRange() : null;

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

    // Preserve zoom/pan on ordinary refreshes and appends. A history prepend
    // shifts existing logical indexes, so offset the saved range by its delta.
    // Only a genuinely fresh chart gets the initial framing below.
    if (savedRange) {
      const delta = isPrepend ? sortedCandles.length - oldCount : 0;
      chart.timeScale().setVisibleLogicalRange({
        from: savedRange.from + delta,
        to: savedRange.to + delta,
      });
    } else if (tradeExecutionSpan) {
      // Frame the executions, padding proportionally to how many candles the
      // trade spans: a tight scalp zooms in; a trade held across many bars stays
      // zoomed out. A minimum window guarantees surrounding context either way.
      const { firstIdx, lastIdx } = tradeExecutionSpan;
      const span = lastIdx - firstIdx;
      const pad = Math.max(6, Math.round(span * 0.8));
      let from = firstIdx - pad;
      let to = lastIdx + pad;
      const MIN_VISIBLE_BARS = 24;
      if (to - from < MIN_VISIBLE_BARS) {
        const center = (firstIdx + lastIdx) / 2;
        from = center - MIN_VISIBLE_BARS / 2;
        to = center + MIN_VISIBLE_BARS / 2;
      }
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, from),
        to: Math.min(sortedCandles.length + 2, to + 2),
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
  }, [sortedCandles, formatCandleTime, tradeExecutionSpan]);

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
    // Precise MetaTrader execution arrows scaled relative to candle bar size
    // are drawn in frame-perfect sync with lightweight-charts render loop via TradeExecutionPrimitive.
    if (primitiveRef.current) {
      primitiveRef.current.update(transactions, sortedCandles, date, isDark);
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

    // 2. Viewport-scoped wick support/resistance and diagonal trendlines.
    if (levelsEnabled) {
      marketStructure.levels.forEach((level) => {
        priceLinesRef.current.push(candleSeries.createPriceLine({
          price: level.price,
          color: level.type === 'support' ? '#64748b' : '#78716c',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: `${level.type === 'support' ? 'Support' : 'Resistance'} · ${level.touches} touches`,
        }));
      });

    }

    if (trendlinesEnabled) {
      marketStructure.trendlines.forEach((trendline) => {
        const lineSeries = chart.addSeries(LineSeries, {
          color: trendline.type === 'rising-support' ? '#3b82f6' : '#8b5cf6',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          lastValueVisible: false,
          priceLineVisible: false,
          title: `${trendline.type === 'rising-support' ? 'Rising support' : 'Falling resistance'} · ${trendline.touches} touches`,
        });
        lineSeries.setData([
          { time: formatCandleTime(visibleCandles[trendline.startIndex].time), value: trendline.startPrice },
          { time: formatCandleTime(visibleCandles[visibleCandles.length - 1].time), value: trendline.projectedPrice },
        ]);
        patternSeriesRef.current.push(lineSeries);
      });
    }

    // 3. Auto Pattern Overlay Geometry Lines & Breakout / Target Lines
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
    marketStructure,
    visibleCandles,
    autoPatternsEnabled,
    levelsEnabled,
    trendlinesEnabled,
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
    <div className={`relative w-full overflow-hidden flex flex-col ${flat ? '' : 'rounded-2xl border border-card-border bg-card-bg shadow-2xl'}`}>
      {/* Chart identity and controls share one compact toolbar row. */}
      <div className="px-3 sm:px-5 py-2.5 border-b border-card-border/60 bg-muted-bg/40 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {showChartIdentity && (
            <div className="flex items-center gap-2.5 min-w-0">
              {showSymbolIcon && (
                <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center text-accent shadow-inner shrink-0">
                  <span className="text-xs font-normal uppercase">{symbol.substring(0, 1)}</span>
                </div>
              )}
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-sm sm:text-base font-normal text-foreground tracking-tight truncate">{title || displaySymbol(symbol)}</span>
                {subtitle && (
                  <span className="text-xs font-normal text-muted truncate">{subtitle}</span>
                )}
                {providerBadge && (
                  <span className="px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wider bg-card-bg text-muted border border-card-border rounded-md shrink-0">
                    {providerBadge}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-1 items-center gap-1.5 flex-wrap">
            {showOverlayControls && (
              <div className="flex items-center gap-0.5 rounded-xl border border-card-border/40 bg-muted-bg/50 p-0.5" aria-label="Chart overlays">
                <button
                  type="button"
                  aria-pressed={autoPatternsEnabled}
                  onClick={onTogglePatterns}
                  disabled={!onTogglePatterns}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-normal transition-colors ${
                    autoPatternsEnabled
                      ? 'bg-card-bg text-foreground shadow-sm'
                      : 'text-muted hover:bg-card-bg/60 hover:text-foreground'
                  } disabled:cursor-default disabled:opacity-50`}
                  title="Toggle geometric chart patterns"
                >
                  <Sparkles size={12} className="text-amber-500" />
                  Patterns
                </button>
                <button
                  type="button"
                  aria-pressed={levelsEnabled}
                  onClick={handleToggleLevels}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-normal transition-colors ${
                    levelsEnabled
                      ? 'bg-card-bg text-foreground shadow-sm'
                      : 'text-muted hover:bg-card-bg/60 hover:text-foreground'
                  }`}
                  title="Toggle horizontal support and resistance levels"
                >
                  <Minus size={12} className="text-slate-500" />
                  Levels
                </button>
                <button
                  type="button"
                  aria-pressed={trendlinesEnabled}
                  onClick={handleToggleTrendlines}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-normal transition-colors ${
                    trendlinesEnabled
                      ? 'bg-card-bg text-foreground shadow-sm'
                      : 'text-muted hover:bg-card-bg/60 hover:text-foreground'
                  }`}
                  title="Toggle diagonal support and resistance trendlines"
                >
                  <ChartNoAxesCombined size={12} className="text-blue-500" />
                  Trendlines
                </button>
              </div>
            )}

            {/* Current Day Filter Toggle */}
            {onToggleCurrentDayOnly && (
              <button
                type="button"
                aria-pressed={currentDayOnly}
                aria-label="Current Day Only"
                onClick={() => onToggleCurrentDayOnly(!currentDayOnly)}
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-normal transition-colors ${
                  currentDayOnly
                    ? 'border-accent/30 bg-accent/10 text-accent'
                    : 'border-card-border/40 bg-muted-bg/50 text-muted hover:text-foreground'
                }`}
                title="Show only candles from the current trading day"
              >
                <CalendarDays size={12} />
                Today
              </button>
            )}

            {/* Replay Trade Button */}
            {onReplayTrade && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onReplayTrade();
                }}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-normal uppercase tracking-wider bg-accent/10 text-accent hover:bg-accent hover:text-white rounded-lg transition-all"
              >
                <Play size={10} fill="currentColor" />
                Replay
              </button>
            )}

            {onIntervalChange && availableIntervals.length > 0 && (
              <div
                className="ml-auto flex items-center gap-0.5 bg-muted-bg/50 p-0.5 rounded-lg border border-card-border/40"
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
                    className={`px-2 py-0.5 text-[11px] font-normal uppercase rounded transition-all ${
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
      </div>

      {/* Chart Canvas Area */}
      <div className="relative w-full">
        {/* Floating geometric-pattern details, scoped to the chart viewport. */}
        <PatternOverlay
          candles={visibleCandles}
          enabled={autoPatternsEnabled}
          onToggleEnabled={showOverlayControls ? onTogglePatterns : undefined}
        />

        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-card-bg/80 backdrop-blur-sm">
            <Loader2 className="w-6 h-6 text-accent animate-spin" />
          </div>
        )}

        {/* Left-edge history loader / start-of-history marker */}
        {onLoadMoreHistory && (loadingMore || !hasMore) && (
          <div className="absolute left-2 top-2 z-20">
            {loadingMore ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-muted bg-[#0c121e]/90 border border-card-border rounded-lg backdrop-blur-sm">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading older history…
              </span>
            ) : (
              <span className="px-2.5 py-1 text-xs font-semibold text-muted/70 bg-[#0c121e]/80 border border-card-border/60 rounded-lg backdrop-blur-sm">
                Earliest loaded · scroll to view
              </span>
            )}
          </div>
        )}

        {error ? (
          <div className="flex items-center justify-center w-full" style={{ height }}>
            <span className="text-sm text-rose-400 font-medium">{error}</span>
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <div ref={containerRef} className="w-full h-full" />
            {hoveredTrade && (
              <div
                className="absolute z-30 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-2 bg-card-bg/95 backdrop-blur-md border border-card-border px-2.5 py-1.5 rounded-lg shadow-xl text-xs flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100"
                style={{ left: hoveredTrade.x, top: hoveredTrade.y - 8 }}
              >
                <div className="flex items-center gap-1.5 font-bold text-sm">
                  <span className={hoveredTrade.isBuy ? 'text-profit' : 'text-loss'}>
                    {hoveredTrade.isBuy ? 'BUY' : 'SELL'}
                  </span>
                  <span className="text-foreground">${hoveredTrade.trade.price.toFixed(2)}</span>
                </div>
                <div className="text-xs text-muted flex items-center gap-2 font-mono">
                  <span>Qty: {Math.abs(hoveredTrade.trade.quantity)}</span>
                  <span>{hoveredTrade.trade.time}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

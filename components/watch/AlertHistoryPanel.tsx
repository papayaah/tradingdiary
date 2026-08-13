'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  History,
  ChevronDown,
  ChevronUp,
  Loader2,
  BarChart2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { calculateWatchPriceChange, candleCountForHours } from '@/lib/market/intraday-change';
import { MAX_ALERT_HISTORY_ITEMS } from '@/lib/watch/alert-history';

interface AlertCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PatternMatchedTag {
  patternId?: string;
  name: string;
  message: string;
}

export interface AlertHistoryItem {
  id: string;
  createdAt: number;
  symbol: string;
  interval: string;
  type: 'bullish' | 'bearish';
  details: string;
  patterns?: PatternMatchedTag[];
  price: number;
  intradayChange?: number | null;
  intradayChangePercent?: number | null;
  candles?: AlertCandle[];
}

interface AlertHistoryPanelProps {
  alerts: AlertHistoryItem[];
  onAlertClick: (alert: AlertHistoryItem) => void;
  onClear: () => void;
}

const formatTimeAgo = (timestamp: number, now: number) => {
  const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (elapsedSeconds < 10) return 'just now';
  if (elapsedSeconds < 60) return `${elapsedSeconds} sec ago`;

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} hr ago`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays} day${elapsedDays === 1 ? '' : 's'} ago`;
};

const TimeAgo = React.memo(function TimeAgo({ timestamp }: { timestamp: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span
      className="whitespace-nowrap text-sm font-semibold leading-none text-foreground"
      title={new Date(timestamp).toLocaleString()}
    >
      {formatTimeAgo(timestamp, now)}
    </span>
  );
});

function get1Point5HourCandleCount(interval: string = '5m'): number {
  const clean = interval.replace(/[ms]/g, '');
  const val = parseInt(clean, 10) || 5;
  const isHour = interval.endsWith('h');
  const minutesPerCandle = isHour ? val * 60 : val;
  const count = Math.ceil((1.5 * 60) / Math.max(1, minutesPerCandle));
  return Math.max(3, Math.min(15, count));
}

const MiniCandles = React.memo(function MiniCandles({ candles, interval = '5m' }: { candles: AlertCandle[]; interval?: string }) {
  const displayCandles = React.useMemo(() => {
    if (!candles || candles.length === 0) return [];
    const count = get1Point5HourCandleCount(interval);
    return candles.slice(-count);
  }, [candles, interval]);

  if (displayCandles.length === 0) return null;

  let maxValue = Number.NEGATIVE_INFINITY;
  let minValue = Number.POSITIVE_INFINITY;
  for (const candle of displayCandles) {
    maxValue = Math.max(maxValue, candle.high);
    minValue = Math.min(minValue, candle.low);
  }

  const range = maxValue - minValue || 1;
  // Fixed display box (larger than the old 28px sparkline); candles auto-fit its
  // width so the same candle count never overflows regardless of interval.
  const width = 172;
  const height = 52;
  const pad = 3;
  const step = (width - pad * 2) / displayCandles.length;
  const candleWidth = Math.max(1.5, Math.min(9, step - 1.5));
  const getScaledY = (price: number) =>
    pad + (height - pad * 2) - ((price - minValue) / range) * (height - pad * 2);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible select-none">
      {displayCandles.map((candle, index) => {
        const x = pad + index * step + (step - candleWidth) / 2;
        const color = candle.close >= candle.open ? '#10b981' : '#f43f5e';
        const openY = getScaledY(candle.open);
        const closeY = getScaledY(candle.close);
        return (
          <g key={candle.time || index}>
            <line
              x1={x + candleWidth / 2}
              y1={getScaledY(candle.high)}
              x2={x + candleWidth / 2}
              y2={getScaledY(candle.low)}
              stroke={color}
              strokeWidth={1.25}
            />
            <rect
              x={x}
              y={Math.min(openY, closeY)}
              width={candleWidth}
              height={Math.max(1.5, Math.abs(openY - closeY))}
              fill={color}
              rx={1}
            />
          </g>
        );
      })}
    </svg>
  );
});

const ExpandedMiniChart = React.memo(function ExpandedMiniChart({
  candles,
  interval = '5m',
}: {
  candles: AlertCandle[];
  interval?: string;
}) {
  const displayCandles = React.useMemo(() => {
    if (!candles || candles.length === 0) return [];
    const targetCount = candleCountForHours(interval);
    return candles.slice(-targetCount);
  }, [candles, interval]);

  if (displayCandles.length === 0) return null;

  let maxPrice = Number.NEGATIVE_INFINITY;
  let minPrice = Number.POSITIVE_INFINITY;
  for (const c of displayCandles) {
    maxPrice = Math.max(maxPrice, c.high);
    minPrice = Math.min(minPrice, c.low);
  }

  const range = maxPrice - minPrice || 1;
  const padding = range * 0.08;
  const highYPrice = maxPrice + padding;
  const lowYPrice = minPrice - padding;
  const fullRange = highYPrice - lowYPrice || 1;

  const width = 320;
  const height = 135;
  const margin = { top: 16, bottom: 18, left: 45, right: 12 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const getScaledY = (price: number) =>
    margin.top + plotHeight - ((price - lowYPrice) / fullRange) * plotHeight;

  const step = plotWidth / Math.max(1, displayCandles.length);
  const candleWidth = Math.max(2, Math.min(10, step - 2));

  return (
    <div className="w-full flex flex-col items-center">
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible select-none font-mono">
        {/* Background Grid Lines */}
        <line x1={margin.left} y1={margin.top} x2={width - margin.right} y2={margin.top} stroke="currentColor" className="text-card-border" strokeDasharray="2,2" />
        <line x1={margin.left} y1={margin.top + plotHeight / 2} x2={width - margin.right} y2={margin.top + plotHeight / 2} stroke="currentColor" className="text-card-border" strokeDasharray="2,2" />
        <line x1={margin.left} y1={margin.top + plotHeight} x2={width - margin.right} y2={margin.top + plotHeight} stroke="currentColor" className="text-card-border" strokeDasharray="2,2" />

        {/* Price Axis Labels */}
        <text x={margin.left - 4} y={margin.top + 3} textAnchor="end" fill="currentColor" className="text-muted" fontSize={9}>
          ${maxPrice.toFixed(2)}
        </text>
        <text x={margin.left - 4} y={margin.top + plotHeight + 3} textAnchor="end" fill="currentColor" className="text-muted" fontSize={9}>
          ${minPrice.toFixed(2)}
        </text>

        {/* Candlesticks */}
        {displayCandles.map((candle, idx) => {
          const x = margin.left + idx * step + step / 2;
          const color = candle.close >= candle.open ? '#10b981' : '#f43f5e';
          const openY = getScaledY(candle.open);
          const closeY = getScaledY(candle.close);
          const highY = getScaledY(candle.high);
          const lowY = getScaledY(candle.low);
          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.max(1.5, Math.abs(openY - closeY));

          return (
            <g key={candle.time || idx}>
              <line x1={x} y1={highY} x2={x} y2={lowY} stroke={color} strokeWidth={Math.max(0.8, candleWidth / 3)} />
              <rect
                x={x - candleWidth / 2}
                y={bodyTop}
                width={candleWidth}
                height={bodyHeight}
                fill={color}
                rx={0.5}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
});

interface AlertHistoryCardProps {
  alert: AlertHistoryItem;
  isExpanded: boolean;
  isOpening: boolean;
  onToggle: (alert: AlertHistoryItem, event: React.MouseEvent) => void;
  onAlertClick: (alert: AlertHistoryItem) => void;
}

const AlertHistoryCard = React.memo(function AlertHistoryCard({
  alert,
  isExpanded,
  isOpening,
  onToggle,
  onAlertClick,
}: AlertHistoryCardProps) {
  const effectiveChange = React.useMemo(() => {
    if (
      Number.isFinite(alert.intradayChange)
      && Number.isFinite(alert.intradayChangePercent)
    ) {
      return {
        amount: alert.intradayChange!,
        percent: alert.intradayChangePercent!,
      };
    }

    // Equities must compare against the previous official close. A saved
    // intraday preview is not a valid substitute because a gap can make its
    // short-window direction opposite to the market-day move. Continuous
    // markets retain their documented candle-window calculation.
    return calculateWatchPriceChange(alert.symbol, alert.interval, alert.candles ?? []);
  }, [
    alert.intradayChange,
    alert.intradayChangePercent,
    alert.symbol,
    alert.interval,
    alert.candles,
  ]);

  const effectiveChangePercent = effectiveChange?.percent ?? null;
  const effectiveChangeAmount = effectiveChange?.amount ?? null;

  const hasIntradayChange = effectiveChangePercent !== null;
  const intradayDirection = (effectiveChangeAmount ?? 0) > 0
    ? 'profit'
    : (effectiveChangeAmount ?? 0) < 0
      ? 'loss'
      : 'flat';
  const formattedIntradayAmount = hasIntradayChange && effectiveChangeAmount !== null
    ? `${effectiveChangeAmount < 0 ? '-' : '+'}$${Math.abs(effectiveChangeAmount).toFixed(2)}`
    : '';
  const formattedIntradayPercent = hasIntradayChange && effectiveChangePercent !== null
    ? `${effectiveChangePercent > 0 ? '+' : ''}${effectiveChangePercent.toFixed(2)}%`
    : '';

  return (
    <div
      className={`p-3 rounded-xl border flex flex-col justify-between gap-2 text-sm transition-all select-none ${
        alert.type === 'bullish'
          ? 'bg-profit/5 border-profit/25 hover:bg-profit/10 hover:border-profit/40'
          : 'bg-loss/5 border-loss/25 hover:bg-loss/10 hover:border-loss/40'
      } ${isExpanded ? 'ring-1 ring-accent border-accent/60' : ''} ${
        isOpening ? 'brightness-110' : ''
      }`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '180px' }}
    >
      <button
        type="button"
        onClick={(event) => onToggle(alert, event)}
        aria-expanded={isExpanded}
        aria-controls={`alert-details-${alert.id}`}
        className="w-full flex flex-col gap-2 text-left cursor-pointer touch-manipulation active:scale-[0.99] active:opacity-80 transition-transform"
        title="Tap to show alert details and chart"
      >
        <div className="flex items-stretch justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground text-base">{alert.symbol}</span>
              <span className="bg-muted-bg text-muted px-1.5 py-0.5 rounded text-xs font-mono">
                {alert.interval}
              </span>
              <span
                className={`inline-flex items-center ${
                  alert.type === 'bullish' ? 'text-profit' : 'text-loss'
                }`}
                title={alert.type === 'bullish' ? 'Bullish alert' : 'Bearish alert'}
              >
                {alert.type === 'bullish' ? (
                  <TrendingUp size={15} aria-hidden="true" />
                ) : (
                  <TrendingDown size={15} aria-hidden="true" />
                )}
                <span className="sr-only">
                  {alert.type === 'bullish' ? 'Bullish alert' : 'Bearish alert'}
                </span>
              </span>
            </div>

            {alert.patterns && alert.patterns.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {alert.patterns.map((p, idx) => (
                  <span
                    key={p.patternId || idx}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border ${
                      alert.type === 'bullish'
                        ? 'bg-profit/15 text-profit border-profit/30'
                        : 'bg-loss/15 text-loss border-loss/30'
                    }`}
                  >
                    <span>{p.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {alert.candles && alert.candles.length > 0 && (
            <div className="flex shrink-0 items-center self-center rounded border border-card-border bg-muted-bg/70 px-1.5 py-1 shadow-inner">
              <MiniCandles candles={alert.candles} interval={alert.interval} />
            </div>
          )}
        </div>

        <div className="flex w-full flex-wrap items-center justify-between gap-3 border-t border-card-border/60 pt-2 font-mono text-xs text-foreground/80">
          <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>Price: ${alert.price.toFixed(2)}</span>
            {hasIntradayChange ? (
              <span
                className={`font-bold ${
                  intradayDirection === 'profit'
                    ? 'text-profit'
                    : intradayDirection === 'loss'
                      ? 'text-loss'
                      : 'text-muted'
                }`}
                title={alert.symbol.includes('=F') || alert.symbol.includes('-USD')
                  ? 'Price change over the displayed session window'
                  : 'Price change from the previous official close'}
              >
                ({formattedIntradayAmount ? `${formattedIntradayAmount} / ` : ''}{formattedIntradayPercent})
              </span>
            ) : null}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className="whitespace-nowrap">
              <TimeAgo timestamp={alert.createdAt} />
            </span>
            <span
              className={`flex min-w-[72px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold transition-all ${
                isExpanded
                ? 'bg-accent text-background border-accent shadow-sm'
                : 'bg-accent/10 text-accent border-accent/30 hover:bg-accent/20'
            }`}
            >
              {isOpening ? (
                <>
                  <Loader2 size={13} className="shrink-0 animate-spin" />
                  <span>Opening...</span>
                </>
              ) : isExpanded ? (
                <>
                  <ChevronUp size={13} className="shrink-0" />
                  <span>Less</span>
                </>
              ) : (
                <>
                  <span>More</span>
                  <ChevronDown size={13} className="shrink-0 opacity-70" />
                </>
              )}
            </span>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div
          id={`alert-details-${alert.id}`}
          className="mt-2 pt-2 border-t border-card-border/40 space-y-2 animate-in fade-in zoom-in-95 duration-150"
          onClick={(event) => event.stopPropagation()}
          aria-live="polite"
        >
          {alert.patterns && alert.patterns.length > 1 ? (
            <div className="space-y-1.5 rounded-lg bg-muted-bg p-2.5 text-xs">
              {alert.patterns.map((pattern, index) => (
                <div
                  key={pattern.patternId || index}
                  className="flex items-start gap-1.5 font-mono text-xs leading-snug text-foreground/90"
                >
                  <span className={`mt-0.5 shrink-0 text-xs font-bold ${alert.type === 'bullish' ? 'text-profit' : 'text-loss'}`}>•</span>
                  <div>
                    <span className="mr-1 font-bold text-foreground">{pattern.name}:</span>
                    <span className="text-foreground/80">{pattern.message}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-muted-bg p-2.5 text-sm font-medium leading-relaxed text-foreground/85">
              {alert.details}
            </p>
          )}

          <div className="flex items-center justify-between text-xs text-muted font-mono">
            <span className="flex items-center gap-1 text-accent font-semibold">
              <BarChart2 size={13} />
              4H window
            </span>
            <button
              type="button"
              onClick={() => onAlertClick(alert)}
              className="text-xs text-accent hover:underline font-semibold flex items-center gap-1"
            >
              <span>View watchlist</span>
              <span>→</span>
            </button>
          </div>

          {isOpening ? (
            <div className="min-h-[135px] bg-background/70 border border-accent/30 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-xs font-mono text-accent">
              <Loader2 size={18} className="animate-spin" />
              <span className="font-semibold">Opening {alert.symbol} chart…</span>
            </div>
          ) : alert.candles && alert.candles.length > 0 ? (
            <div className="bg-background/70 border border-card-border rounded-xl p-2 flex flex-col items-center">
              <ExpandedMiniChart candles={alert.candles} interval={alert.interval} />
            </div>
          ) : (
            <div className="bg-background/70 border border-card-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-xs font-mono text-foreground text-center">
              <div className="flex items-center gap-2 text-accent font-semibold">
                <Loader2 size={14} className="animate-spin" />
                <span>Fetching Live {alert.symbol} {alert.interval} Chart Data...</span>
              </div>
              <button
                type="button"
                onClick={() => onAlertClick(alert)}
                className="mt-1 px-3 py-1 bg-accent/20 hover:bg-accent hover:text-background border border-accent/40 text-accent rounded-lg text-[11px] font-semibold transition-all"
              >
                Jump to Watchlist to View Chart →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function AlertHistoryPanel({
  alerts,
  onAlertClick,
  onClear,
}: AlertHistoryPanelProps) {
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [openingAlertId, setOpeningAlertId] = useState<string | null>(null);
  const expandedAlertIdRef = useRef<string | null>(null);
  const openingTimerRef = useRef<number | null>(null);

  const toggleAlertExpand = useCallback((alert: AlertHistoryItem, event: React.MouseEvent) => {
    event.stopPropagation();
    if (openingTimerRef.current !== null) {
      window.clearTimeout(openingTimerRef.current);
      openingTimerRef.current = null;
    }

    if (expandedAlertIdRef.current === alert.id) {
      expandedAlertIdRef.current = null;
      flushSync(() => {
        setOpeningAlertId(null);
        setExpandedAlertId(null);
      });
      return;
    }

    expandedAlertIdRef.current = alert.id;
    flushSync(() => {
      setOpeningAlertId(alert.id);
      setExpandedAlertId(alert.id);
    });
    openingTimerRef.current = window.setTimeout(() => {
      setOpeningAlertId((current) => (current === alert.id ? null : current));
      openingTimerRef.current = null;
    }, 300);
  }, []);

  useEffect(() => () => {
    if (openingTimerRef.current !== null) {
      window.clearTimeout(openingTimerRef.current);
    }
  }, []);

  return (
    <div className="lg:col-span-4">
      <div className="bg-card-bg border border-card-border shadow-xl rounded-2xl p-4 md:p-5 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <History size={18} className="text-accent" /> Alert History
            </h2>
            <p className="mt-0.5 text-xs font-medium text-foreground/70">
              Keeping the latest {MAX_ALERT_HISTORY_ITEMS} alerts
            </p>
          </div>
          {alerts.length > 0 && (
            <button
              onClick={onClear}
              className="text-xs text-muted hover:text-foreground transition-colors"
            >
              Clear History
            </button>
          )}
        </div>

        {alerts.length === 0 ? (
          <div className="text-center py-12 text-muted text-xs flex-1 flex items-center justify-center border border-dashed border-card-border rounded-xl min-h-[140px]">
            No alerts yet.
          </div>
        ) : (
          <div className="space-y-3 overflow-y-auto flex-1 pr-1 min-h-[140px] lg:min-h-[400px] max-h-[calc(100vh-220px)]">
            {alerts.map((alert) => (
              <AlertHistoryCard
                key={alert.id}
                alert={alert}
                isExpanded={expandedAlertId === alert.id}
                isOpening={openingAlertId === alert.id}
                onToggle={toggleAlertExpand}
                onAlertClick={onAlertClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(AlertHistoryPanel);

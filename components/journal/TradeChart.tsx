'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  createSeriesMarkers,
  type IChartApi,
  type CandlestickData,
  type HistogramData,
  type Time,
} from 'lightweight-charts';
import { fetchCandles } from '@/lib/chart/fetch';
import type { TransactionRecord } from '@/lib/db/schema';
import { Loader2, Play } from 'lucide-react';
import Link from 'next/link';

interface TradeChartProps {
  symbol: string;
  date: string;
  transactions: TransactionRecord[];
  interval?: string;
}

const INTERVALS = ['1m', '5m', '10m', '15m', '1h'] as const;

/**
 * Compute the UTC→ET offset in seconds for a given date.
 * Returns a negative value (e.g. -18000 for EST, -14400 for EDT)
 * that when added to a UTC timestamp gives an ET-display timestamp.
 */
function getETOffsetSeconds(dateStr: string): number {
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
  // etHourAtNoonUTC is 7 for EST (UTC-5) or 8 for EDT (UTC-4)
  return (etHourAtNoonUTC - 12) * 3600; // -18000 (EST) or -14400 (EDT)
}

export default function TradeChart({ symbol, date, transactions, interval: defaultInterval = '5m' }: TradeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [interval, setInterval] = useState(defaultInterval);

  useEffect(() => {
    if (!containerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    let cancelled = false;

    async function loadChart() {
      setLoading(true);
      setError('');

      try {
        const rawCandles = await fetchCandles(symbol, date, interval);

        if (cancelled || !containerRef.current) return;

        if (rawCandles.length === 0) {
          setError('No chart data available for this symbol/date');
          setLoading(false);
          return;
        }

        // Shift all timestamps from UTC to ET so the x-axis shows Eastern Time.
        // lightweight-charts displays unix timestamps as UTC, so we offset to fake ET display.
        const etOffset = getETOffsetSeconds(date);
        const candles = rawCandles.map((c) => ({ ...c, time: c.time + etOffset }));

        // Filter to only the relevant trading day (4 AM ET to 8 PM ET)
        const year = parseInt(date.substring(0, 4));
        const month = parseInt(date.substring(4, 6)) - 1;
        const day = parseInt(date.substring(6, 8));
        
        // Use "Display Time" (Fake UTC) for bounds to match shifted candles
        const dayStartET = Math.floor(Date.UTC(year, month, day, 4, 0, 0) / 1000);
        const dayEndET = Math.floor(Date.UTC(year, month, day, 20, 0, 0) / 1000);
        const filteredCandles = candles.filter((c) => c.time >= dayStartET && c.time <= dayEndET);
        const chartCandles = filteredCandles.length > 0 ? filteredCandles : candles;

        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        const chart = createChart(containerRef.current, {
          width: containerRef.current.clientWidth,
          height: 350,
          layout: {
            background: { type: ColorType.Solid, color: isDark ? '#151c2c' : '#ffffff' },
            textColor: isDark ? '#9ca3af' : '#6b7280',
            fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
            fontSize: 11,
          },
          grid: {
            vertLines: { color: isDark ? '#1e293b' : '#f0f0f0' },
            horzLines: { color: isDark ? '#1e293b' : '#f0f0f0' },
          },
          crosshair: {
            mode: 0,
          },
          rightPriceScale: {
            borderColor: isDark ? '#1e293b' : '#e5e7eb',
          },
          timeScale: {
            borderColor: isDark ? '#1e293b' : '#e5e7eb',
            timeVisible: true,
            secondsVisible: false,
          },
        });

        chartRef.current = chart;

        // Candlestick series
        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: isDark ? '#4ade80' : '#16a34a',
          downColor: isDark ? '#f87171' : '#dc2626',
          borderUpColor: isDark ? '#4ade80' : '#16a34a',
          borderDownColor: isDark ? '#f87171' : '#dc2626',
          wickUpColor: isDark ? '#4ade80' : '#16a34a',
          wickDownColor: isDark ? '#f87171' : '#dc2626',
        });

        const candleData: CandlestickData[] = chartCandles.map((c) => ({
          time: c.time as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));

        candleSeries.setData(candleData);

        // Volume series
        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume',
        });

        chart.priceScale('volume').applyOptions({
          scaleMargins: { top: 0.8, bottom: 0 },
        });

        const volumeData: HistogramData[] = chartCandles.map((c) => ({
          time: c.time as Time,
          value: c.volume,
          color: c.close >= c.open
            ? (isDark ? 'rgba(74, 222, 128, 0.3)' : 'rgba(22, 163, 74, 0.3)')
            : (isDark ? 'rgba(248, 113, 113, 0.3)' : 'rgba(220, 38, 38, 0.3)'),
        }));

        volumeSeries.setData(volumeData);

        // Add labels/markers on the candlestick series.
        const markers = transactions
          .map((t) => {
            const tradeTime = findClosestCandleTime(chartCandles, t.time, date);
            if (tradeTime === null) return null;

            const isBuy = t.side === 'BUYTOOPEN' || t.side === 'BUYTOCLOSE';
            return {
              time: tradeTime as Time,
              position: isBuy ? ('belowBar' as const) : ('aboveBar' as const),
              color: isBuy
                ? (isDark ? '#4ade80' : '#16a34a')
                : (isDark ? '#f87171' : '#dc2626'),
              shape: isBuy ? ('arrowUp' as const) : ('arrowDown' as const),
              text: `${isBuy ? 'B' : 'S'} ${Math.abs(t.quantity)}`,
            };
          })
          .filter((m): m is NonNullable<typeof m> => m !== null)
          .sort((a, b) => (a.time as number) - (b.time as number));

        if (markers.length > 0) {
          createSeriesMarkers(candleSeries, markers);
        }

        // Draw a horizontal price line at each executed price so the buy/sell price
        // is readable on the right axis — non-overlapping with the arrow markers.
        // Dedupe identical side+price pairs to avoid stacking duplicate lines.
        const seenPriceLines = new Set<string>();
        transactions.forEach((t) => {
          if (typeof t.price !== 'number' || !isFinite(t.price) || t.price <= 0) return;
          const isBuy = t.side === 'BUYTOOPEN' || t.side === 'BUYTOCLOSE';
          const key = `${isBuy ? 'B' : 'S'}-${t.price.toFixed(2)}`;
          if (seenPriceLines.has(key)) return;
          seenPriceLines.add(key);

          candleSeries.createPriceLine({
            price: t.price,
            color: isBuy
              ? (isDark ? '#4ade80' : '#16a34a')
              : (isDark ? '#f87171' : '#dc2626'),
            lineWidth: 1,
            lineStyle: 2, // dashed
            axisLabelVisible: true,
            title: isBuy ? 'Buy' : 'Sell',
          });
        });

        // --- Smart Zoom: Center the view on the trades ---
        // Find the time range of actual trades
        const tradeTimes = transactions.map(t => {
            const [h, m, s] = t.time.split(':').map(Number);
            return Math.floor(Date.UTC(year, month, day, h, m, s || 0) / 1000);
        });
        const minTrade = Math.min(...tradeTimes);
        const maxTrade = Math.max(...tradeTimes);

        // Add padding (30-60 mins depending on interval)
        // Center the view on the trades (ignore hard 4 AM floor for better readability)
        const marginSeconds = interval.includes('m') ? parseInt(interval) * 60 * 20 : 3600; 
        const zoomStart = minTrade - marginSeconds;
        const zoomEnd = maxTrade + marginSeconds;

        // Use a tiny timeout to ensure the chart has processed the data before zooming
        setTimeout(() => {
          if (chart) {
            chart.timeScale().setVisibleRange({
              from: zoomStart as Time,
              to: zoomEnd as Time,
            });
          }
        }, 50);

        // Handle resize
        const observer = new ResizeObserver(() => {
          if (containerRef.current && chartRef.current) {
            chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
          }
        });
        observer.observe(containerRef.current);

        setLoading(false);

        return () => {
          observer.disconnect();
        };
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load chart');
          setLoading(false);
        }
      }
    }

    loadChart();

    return () => {
      cancelled = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [symbol, date, interval, transactions]);

  return (
    <div className="border-t border-card-border/50 bg-card-bg/30">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent shadow-inner">
            <span className="text-xs font-black uppercase">{symbol.substring(0, 1)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-black text-foreground tracking-tight">{symbol}</span>
            <span className="text-[10px] font-bold text-muted uppercase tracking-widest">{formatChartDate(date)}</span>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Link
            href={`/replay?date=${date}&symbol=${symbol}`}
            className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-accent/10 text-accent hover:bg-accent hover:text-white rounded transition-all mr-2"
          >
            <Play size={10} fill="currentColor" />
            Replay Trade
          </Link>
          <div className="flex items-center gap-1.5 bg-muted-bg/50 p-1 rounded-xl border border-card-border/40">
            {INTERVALS.map((iv) => (
              <button
                key={iv}
                onClick={(e) => {
                  e.stopPropagation();
                  setInterval(iv);
                }}
                className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all duration-200 ${iv === interval
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-muted hover:text-foreground hover:bg-sidebar-hover'
                  }`}
              >
                {iv}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="relative mx-6 mb-6 rounded-2xl border border-card-border/50 bg-card-bg overflow-hidden shadow-sm">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-card-bg/60 backdrop-blur-[2px] z-10">
            <Loader2 size={32} className="text-accent animate-spin mb-2" />
            <span className="text-[10px] font-bold text-muted uppercase tracking-widest">Loading Chart Data</span>
          </div>
        )}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center h-[350px] text-sm text-muted gap-3">
            <div className="w-12 h-12 rounded-full bg-loss/10 flex items-center justify-center text-loss">!</div>
            <span className="font-medium">{error}</span>
          </div>
        )}
        <div ref={containerRef} className={loading || error ? 'hidden' : ''} />
      </div>
    </div>
  );
}

/**
 * Find the candle whose timestamp is closest to (but not after) the trade time.
 * Both candle timestamps and trade time are in ET (candles were pre-shifted).
 */
function findClosestCandleTime(candles: { time: number }[], tradeTimeStr: string, dateStr: string): number | null {
  if (candles.length === 0) return null;

  const [h, m, s] = tradeTimeStr.split(':').map(Number);
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));

  // This must match the display-time shift (UTC-ET offset)
  const tradeTimeUtc = Math.floor(Date.UTC(year, month, day, h, m, s || 0) / 1000);

  // Find the candle that's active at this trade time (must be <= tradeTimeUtc)
  const relevantCandles = candles.filter(c => c.time <= tradeTimeUtc);
  if (relevantCandles.length === 0) return candles[0].time; // Fallback to first candle

  return relevantCandles.sort((a, b) => b.time - a.time)[0].time;
}

function formatChartDate(dateStr: string): string {
  const y = parseInt(dateStr.substring(0, 4));
  const m = parseInt(dateStr.substring(4, 6)) - 1;
  const d = parseInt(dateStr.substring(6, 8));
  return new Date(y, m, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

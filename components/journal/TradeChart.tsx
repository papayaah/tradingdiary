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
import type { OHLCCandle } from '@/lib/chart/types';
import type { TransactionRecord } from '@/lib/db/schema';
import { Loader2 } from 'lucide-react';

interface TradeChartProps {
  symbol: string;
  date: string;
  transactions: TransactionRecord[];
  interval?: string;
}

const INTERVALS = ['1m', '5m', '15m', '1h'] as const;

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
        const candles = await fetchCandles(symbol, date, interval);

        if (cancelled || !containerRef.current) return;

        if (candles.length === 0) {
          setError('No chart data available for this symbol/date');
          setLoading(false);
          return;
        }

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

        const candleData: CandlestickData[] = candles.map((c) => ({
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

        const volumeData: HistogramData[] = candles.map((c) => ({
          time: c.time as Time,
          value: c.volume,
          color: c.close >= c.open
            ? (isDark ? 'rgba(74, 222, 128, 0.3)' : 'rgba(22, 163, 74, 0.3)')
            : (isDark ? 'rgba(248, 113, 113, 0.3)' : 'rgba(220, 38, 38, 0.3)'),
        }));

        volumeSeries.setData(volumeData);

        // Add buy/sell markers on the candlestick series
        const markers = transactions
          .map((t) => {
            const tradeTime = findClosestCandleTime(candles, t.time, date);
            if (tradeTime === null) return null;

            const isBuy = t.side === 'BUYTOOPEN' || t.side === 'BUYTOCLOSE';
            return {
              time: tradeTime as Time,
              position: isBuy ? ('belowBar' as const) : ('aboveBar' as const),
              color: isBuy
                ? (isDark ? '#4ade80' : '#16a34a')
                : (isDark ? '#f87171' : '#dc2626'),
              shape: isBuy ? ('arrowUp' as const) : ('arrowDown' as const),
              text: `${isBuy ? 'B' : 'S'} ${Math.abs(t.quantity)}@${t.price.toFixed(2)}`,
            };
          })
          .filter((m): m is NonNullable<typeof m> => m !== null)
          .sort((a, b) => (a.time as number) - (b.time as number));

        if (markers.length > 0) {
          createSeriesMarkers(candleSeries, markers);
        }

        chart.timeScale().fitContent();

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
    <div className="border-t border-card-border bg-card-bg">
      <div className="flex items-center justify-between px-5 py-2 border-b border-card-border">
        <div className="text-xs font-medium text-foreground">
          {symbol} &middot; {formatChartDate(date)} &middot; {interval} chart
        </div>
        <div className="flex gap-1">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              onClick={(e) => {
                e.stopPropagation();
                setInterval(iv);
              }}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                iv === interval
                  ? 'bg-accent text-white'
                  : 'text-muted hover:text-foreground hover:bg-sidebar-hover'
              }`}
            >
              {iv}
            </button>
          ))}
        </div>
      </div>
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-card-bg/80 z-10">
            <Loader2 size={24} className="text-accent animate-spin" />
          </div>
        )}
        {error && !loading && (
          <div className="flex items-center justify-center h-[350px] text-sm text-muted">
            {error}
          </div>
        )}
        <div ref={containerRef} className={error && !loading ? 'hidden' : ''} />
      </div>
    </div>
  );
}

function findClosestCandleTime(candles: OHLCCandle[], tradeTime: string, date: string): number | null {
  if (candles.length === 0) return null;

  const [h, m, s] = tradeTime.split(':').map(Number);
  const year = parseInt(date.substring(0, 4));
  const month = parseInt(date.substring(4, 6)) - 1;
  const day = parseInt(date.substring(6, 8));
  const tradeTimestamp = Math.floor(new Date(year, month, day, h, m, s).getTime() / 1000);

  let closest = candles[0].time;
  for (const c of candles) {
    if (c.time <= tradeTimestamp) {
      closest = c.time;
    } else {
      break;
    }
  }
  return closest;
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

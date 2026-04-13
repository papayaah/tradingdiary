'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
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
import { fetchCandles, type CandleData } from '@/lib/chart/fetch';
import type { TransactionRecord } from '@/lib/db/schema';
import { Loader2 } from 'lucide-react';
import { timeToSeconds } from '@/lib/replay/engine';

interface ReplayChartProps {
    symbol: string;
    date: string;
    transactions: TransactionRecord[];
    currentTimeSeconds: number;
    interval?: string;
}

/**
 * Compute UTC→ET offset.
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
    return (etHourAtNoonUTC - 12) * 3600;
}

export default function ReplayChart({
    symbol,
    date,
    transactions,
    currentTimeSeconds,
    interval = '1m'
}: ReplayChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<any>(null);
    const seriesRef = useRef<any>(null);
    const volumeRef = useRef<any>(null);
    const rangeSetRef = useRef<string>('');
    
    const [allCandles, setAllCandles] = useState<CandleData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const etOffset = useMemo(() => getETOffsetSeconds(date), [date]);

    // 1. Fetch all day's candles once
    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            try {
                const data = await fetchCandles(symbol, date, interval);
                if (cancelled) return;
                setAllCandles(data);
                setLoading(false);
            } catch (e) {
                if (!cancelled) {
                    setError('Chart data unavailable');
                    setLoading(false);
                }
            }
        }
        load();
        return () => { cancelled = true; };
    }, [symbol, date, interval]);

    // 2. Initialize Chart
    useEffect(() => {
        if (!containerRef.current || allCandles.length === 0) return;

        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const chart = createChart(containerRef.current, {
            width: containerRef.current.clientWidth,
            height: 400,
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: isDark ? '#9ca3af' : '#6b7280',
                fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
                fontSize: 11,
            },
            grid: {
                vertLines: { color: isDark ? '#1e293b' : '#f0f0f0' },
                horzLines: { color: isDark ? '#1e293b' : '#f0f0f0' },
            },
            rightPriceScale: { borderColor: isDark ? '#1e293b' : '#e5e7eb' },
            timeScale: {
                borderColor: isDark ? '#1e293b' : '#e5e7eb',
                timeVisible: true,
            },
        });

        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: isDark ? '#4ade80' : '#16a34a',
            downColor: isDark ? '#f87171' : '#dc2626',
            borderUpColor: isDark ? '#4ade80' : '#16a34a',
            borderDownColor: isDark ? '#f87171' : '#dc2626',
            wickUpColor: isDark ? '#4ade80' : '#16a34a',
            wickDownColor: isDark ? '#f87171' : '#dc2626',
        });

        const volumeSeries = chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
        });

        chart.priceScale('volume').applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        });

        chartRef.current = chart;
        seriesRef.current = candleSeries;
        volumeRef.current = volumeSeries;

        const observer = new ResizeObserver(() => {
            if (containerRef.current && chartRef.current) {
                chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
            }
        });
        observer.observe(containerRef.current);

        return () => {
            observer.disconnect();
            chart.remove();
        };
    }, [allCandles]);

    // 3. Update Chart Content based on Current Time
    useEffect(() => {
        if (!seriesRef.current || !volumeRef.current || allCandles.length === 0) return;

        // "Now" in UTC (since allCandles timestamps are UTC)
        const year = parseInt(date.substring(0, 4));
        const month = parseInt(date.substring(4, 6)) - 1;
        const day = parseInt(date.substring(6, 8));
        // currentTimeSeconds is ET-based (seconds since midnight)
        // To get the corresponding UTC timestamp: midnight ET in UTC + currentTimeSeconds
        const currentUtcTimestamp = Math.floor(Date.UTC(year, month, day, 0, 0, 0) / 1000) - etOffset + currentTimeSeconds;

        const visibleCandles = allCandles.filter(c => c.time <= currentUtcTimestamp);
        
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        const candleData = visibleCandles.map(c => ({
            time: (c.time + etOffset) as Time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close
        }));


        seriesRef.current.setData(candleData);
        
        // --- Smart Zoom: Center the view on the trades ---
        const tradeTimes = transactions.map(t => {
            const [h, m, s] = t.time.split(':').map(Number);
            return Math.floor(Date.UTC(year, month, day, h, m, s || 0) / 1000);
        });
        const minTrade = (tradeTimes.length > 0) ? Math.min(...tradeTimes) : 0;
        const maxTrade = (tradeTimes.length > 0) ? Math.max(...tradeTimes) : 0;

        const dayStartET = Math.floor(Date.UTC(year, month, day, 4, 0, 0) / 1000);
        const dayEndET = Math.floor(Date.UTC(year, month, day, 20, 0, 0) / 1000);

        // Padding: approx 15 candles
        const intervalNum = parseInt(interval) || 1;
        const marginSeconds = intervalNum * 60 * 20;
        
        const zoomStart = minTrade > 0 ? (minTrade - marginSeconds) : dayStartET;
        const zoomEnd = maxTrade > 0 ? (maxTrade + marginSeconds) : dayEndET;

        // Use a tiny timeout to ensure the chart has processed the data before zooming
        setTimeout(() => {
          if (chartRef.current) {
            chartRef.current.timeScale().setVisibleRange({
              from: zoomStart as Time,
              to: zoomEnd as Time,
            });
          }
        }, 50);

        volumeRef.current.setData(visibleCandles.map(c => ({
            time: (c.time + etOffset) as Time,
            value: c.volume,
            color: c.close >= c.open
                ? (isDark ? 'rgba(74, 222, 128, 0.3)' : 'rgba(22, 163, 74, 0.3)')
                : (isDark ? 'rgba(248, 113, 113, 0.3)' : 'rgba(220, 38, 38, 0.3)'),
        })));


        // Markers
        const visibleMarkers = transactions
            .filter(t => timeToSeconds(t.time) <= currentTimeSeconds)
            .map(t => {
                const [h, m, s] = t.time.split(':').map(Number);
                // Correct: 10:11 AM ET in UTC is Date.UTC(..., 10, 11, 0) - etOffset
                const tradeTimeUtc = Math.floor(Date.UTC(year, month, day, h, m, s || 0) / 1000) - etOffset;
                
                // Snap to closest candle time for positioning
                const closestCandle = visibleCandles.length > 0 
                  ? visibleCandles.reduce((prev, curr) => 
                      Math.abs(curr.time - tradeTimeUtc) < Math.abs(prev.time - tradeTimeUtc) ? curr : prev
                    )
                  : null;

                const isBuy = t.side === 'BUYTOOPEN' || t.side === 'BUYTOCLOSE';
                return {
                    time: (closestCandle ? closestCandle.time + etOffset : tradeTimeUtc + etOffset) as Time,
                    position: isBuy ? 'belowBar' : 'aboveBar',
                    color: isBuy ? (isDark ? '#4ade80' : '#16a34a') : (isDark ? '#f87171' : '#dc2626'),
                    shape: isBuy ? 'arrowUp' : 'arrowDown',
                    text: `${isBuy ? 'B' : 'S'} ${Math.abs(t.quantity)}`,
                };
            })
            .sort((a,b) => (a.time as number) - (b.time as number));

        createSeriesMarkers(seriesRef.current, visibleMarkers);

    }, [currentTimeSeconds, allCandles, transactions, date, etOffset]);

    return (
        <div className="relative w-full h-[400px] bg-card-bg rounded-xl border border-card-border overflow-hidden">
            <div className="absolute top-3 left-4 z-20 flex items-center gap-2">
                <span className="text-xs font-bold text-foreground bg-accent/20 px-2 py-0.5 rounded uppercase tracking-widest">
                    {symbol}
                </span>
                <span className="text-[10px] text-muted font-medium">
                    {interval} Replay
                </span>
            </div>
            
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-card-bg/50 z-10">
                    <Loader2 size={24} className="text-accent animate-spin" />
                </div>
            )}
            
            {!loading && error && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
                    {error}
                </div>
            )}
            
            <div ref={containerRef} className={`w-full h-full ${loading || error ? 'hidden' : ''}`} />
        </div>
    );
}

'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import {
    createChart,
    ColorType,
    CandlestickSeries,
    HistogramSeries,
    createSeriesMarkers,
} from 'lightweight-charts';
import type {
    IChartApi,
    CandlestickData,
    HistogramData,
    Time,
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
    isPlaying?: boolean;
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
    interval = '1m',
    isPlaying = false
}: ReplayChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<any>(null);
    const seriesRef = useRef<any>(null);
    const volumeRef = useRef<any>(null);
    const markersApiRef = useRef<any>(null);
    const rangeSetRef = useRef<string>('');
    
    const [allCandles, setAllCandles] = useState<CandleData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isFollowing, setIsFollowing] = useState(true); // Auto-follow playhead

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
            upColor: isDark ? '#4ade80' : '#22c55e',
            downColor: isDark ? '#f87171' : '#ef4444',
            borderVisible: false,
            wickVisible: true,
        });
        seriesRef.current = candleSeries;

        const volumeSeries = chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
        });
        volumeSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        });
        volumeRef.current = volumeSeries;

        // Create ONE markers plugin — store the returned API for atomic updates
        const markersApi = createSeriesMarkers(candleSeries, []);
        markersApiRef.current = markersApi;

        chartRef.current = chart;

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
        const midnightEtUtc = Math.floor(Date.UTC(year, month, day, 0, 0, 0) / 1000) - etOffset;
        const currentUtcTimestamp = midnightEtUtc + currentTimeSeconds;

        const visibleCandles = allCandles.filter(c => c.time <= currentUtcTimestamp);
        
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        const candleData = visibleCandles.map(c => ({
            time: (c.time + etOffset) as Time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close
        }));

        // Calculate markers for past executions
        const visibleMarkers = transactions
            .map(t => {
                const [h, m, s] = t.time.split(':').map(Number);
                const tradeTimeUtc = Math.floor(Date.UTC(year, month, day, h, m, s || 0) / 1000) - etOffset;
                
                // HIDE if in the future
                if (tradeTimeUtc > currentUtcTimestamp) return null;

                // Bind to latest candle at or before trade
                const candle = visibleCandles.filter(c => c.time <= tradeTimeUtc)
                                           .sort((a,b) => b.time - a.time)[0];
                
                if (!candle) return null;

                const isBuy = t.side === 'BUYTOOPEN' || t.side === 'BUYTOCLOSE';
                return {
                    time: (candle.time + etOffset) as Time,
                    position: isBuy ? 'belowBar' : 'aboveBar',
                    color: isBuy ? (isDark ? '#4ade80' : '#16a34a') : (isDark ? '#f87171' : '#dc2626'),
                    shape: isBuy ? 'arrowUp' : 'arrowDown',
                    text: `${isBuy ? 'B' : 'S'} ${Math.abs(t.quantity)}`,
                };
            })
            .filter((m): m is any => m !== null)
            .sort((a,b) => (a.time as number) - (b.time as number));

        seriesRef.current.setData(candleData);
        volumeRef.current.setData(visibleCandles.map(c => ({
            time: (c.time + etOffset) as Time,
            value: c.volume,
            color: c.close >= c.open
                ? (isDark ? 'rgba(74, 222, 128, 0.3)' : 'rgba(22, 163, 74, 0.3)')
                : (isDark ? 'rgba(248, 113, 113, 0.3)' : 'rgba(220, 38, 38, 0.3)'),
        })));

        // Update the SINGLE markers plugin atomically — no new layers created
        if (markersApiRef.current) {
            markersApiRef.current.setMarkers(visibleMarkers);
        }

    }, [currentTimeSeconds, allCandles, transactions, date, etOffset]);

    // 4. Smart Zoom (Perform ONLY when data loads or interval changes)
    useEffect(() => {
        if (!chartRef.current || allCandles.length === 0) return;

        const year = parseInt(date.substring(0, 4));
        const month = parseInt(date.substring(4, 6)) - 1;
        const day = parseInt(date.substring(6, 8));

        // Center on trades
        const tradeTimes = transactions.map(t => {
            const [h, m, s] = t.time.split(':').map(Number);
            return Math.floor(Date.UTC(year, month, day, h, m, s || 0) / 1000);
        });
        const minTrade = (tradeTimes.length > 0) ? Math.min(...tradeTimes) : 0;
        const maxTrade = (tradeTimes.length > 0) ? Math.max(...tradeTimes) : 0;

        const dayStartET = Math.floor(Date.UTC(year, month, day, 4, 0, 0) / 1000);
        const dayEndET = Math.floor(Date.UTC(year, month, day, 20, 0, 0) / 1000);

        const intervalNum = parseInt(interval) || 1;
        const marginSeconds = intervalNum * 60 * 20;
        
        const zoomStart = minTrade > 0 ? (minTrade - marginSeconds) : dayStartET;
        const zoomEnd = maxTrade > 0 ? (maxTrade + marginSeconds) : dayEndET;

        setTimeout(() => {
          if (chartRef.current) {
            chartRef.current.timeScale().setVisibleRange({
              from: (zoomStart + etOffset) as Time,
              to: (zoomEnd + etOffset) as Time,
            });
          }
        }, 200);
    }, [allCandles.length, interval, date, transactions.length, etOffset]);

    // 5. Auto-follow playhead
    useEffect(() => {
        if (!chartRef.current || !isFollowing || allCandles.length === 0) return;
        
        // Scroll to the rightmost bar (the current playhead)
        chartRef.current.timeScale().scrollToPosition(0, true);
    }, [currentTimeSeconds, isFollowing, allCandles.length]);

    // Resume following if playback starts
    useEffect(() => {
        if (isPlaying) setIsFollowing(true);
    }, [isPlaying]);

    return (
        <div 
          className="relative w-full h-[400px] bg-card-bg rounded-xl border border-card-border overflow-hidden"
          onMouseDown={() => setIsFollowing(false)} // Stop following if user interacts with chart
          onWheel={() => setIsFollowing(false)}
        >
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

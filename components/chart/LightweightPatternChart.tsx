'use client';

import React, { useEffect, useRef, useMemo } from 'react';
import {
  createChart,
  ColorType,
  IChartApi,
  CandlestickSeries,
  LineSeries,
  Time,
  SeriesMarker,
  LineStyle,
  createSeriesMarkers,
} from 'lightweight-charts';
import { CandleData, detectAllPatterns, DetectedPattern, DoubleTopBottomResult, CupAndHandleResult, HeadAndShouldersResult } from '@/lib/chart/patterns';
import PatternOverlay from './PatternOverlay';

interface LightweightPatternChartProps {
  candles: CandleData[];
  height?: number;
  autoPatternsEnabled?: boolean;
  onTogglePatterns?: () => void;
}

export default function LightweightPatternChart({
  candles,
  height = 360,
  autoPatternsEnabled = true,
  onTogglePatterns,
}: LightweightPatternChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const scanResult = useMemo(() => {
    if (!autoPatternsEnabled || !candles || candles.length < 15) {
      return { patterns: [], totalDetected: 0 };
    }
    return detectAllPatterns(candles);
  }, [candles, autoPatternsEnabled]);

  const activePattern = scanResult.patterns[0] as DetectedPattern | undefined;

  useEffect(() => {
    if (!containerRef.current || !candles || candles.length === 0) return;

    // Clean up existing chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = containerRef.current;
    const isDark = true;

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#090d16' },
        textColor: '#94a3b8',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      crosshair: {
        mode: 0,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        scaleMargins: {
          top: 0.15,
          bottom: 0.15,
        },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderUpColor: '#10b981',
      borderDownColor: '#f43f5e',
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });

    // Format candle times sorted ascending
    const sortedCandles = [...candles].sort((a, b) => a.time - b.time);
    const candleData = sortedCandles.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    candleSeries.setData(candleData);

    // Plot Pattern Geometry Lines, Breakout Levels, and Pivot Node Markers ① ② ③
    if (autoPatternsEnabled && activePattern) {
      // 1. Breakout Price Line
      candleSeries.createPriceLine({
        price: activePattern.breakoutPrice,
        color: '#f59e0b',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `Breakout: $${activePattern.breakoutPrice.toFixed(2)}`,
      });

      // 2. Target Price Line
      candleSeries.createPriceLine({
        price: activePattern.targetPrice,
        color: '#10b981',
        lineWidth: 2,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: `Target: $${activePattern.targetPrice.toFixed(2)}`,
      });

      // 3. Stop Loss Price Line
      candleSeries.createPriceLine({
        price: activePattern.stopLossPrice,
        color: '#f43f5e',
        lineWidth: 1,
        lineStyle: LineStyle.LargeDashed,
        axisLabelVisible: true,
        title: `Stop: $${activePattern.stopLossPrice.toFixed(2)}`,
      });

      // 4. Pattern Geometry Lines & Numbered Pivot Markers
      const markers: SeriesMarker<Time>[] = [];

      if (activePattern.name === 'Double Bottom (W)' || activePattern.name === 'Double Top (M)') {
        const res = activePattern as DoubleTopBottomResult;
        const lineSeries = chart.addSeries(LineSeries, {
          color: res.type === 'bullish' ? '#38bdf8' : '#fbbf24',
          lineWidth: 4,
          lineStyle: LineStyle.Solid,
        });

        // Set line connecting Pivot 1 -> Middle Pivot -> Pivot 2
        lineSeries.setData([
          { time: res.firstPivot.time as Time, value: res.firstPivot.price },
          { time: res.middlePivot.time as Time, value: res.middlePivot.price },
          { time: res.secondPivot.time as Time, value: res.secondPivot.price },
        ]);

        markers.push(
          {
            time: res.firstPivot.time as Time,
            position: res.type === 'bullish' ? 'belowBar' : 'aboveBar',
            color: res.type === 'bullish' ? '#38bdf8' : '#f43f5e',
            shape: 'circle',
            text: '①',
          },
          {
            time: res.middlePivot.time as Time,
            position: res.type === 'bullish' ? 'aboveBar' : 'belowBar',
            color: '#f59e0b',
            shape: 'circle',
            text: '②',
          },
          {
            time: res.secondPivot.time as Time,
            position: res.type === 'bullish' ? 'belowBar' : 'aboveBar',
            color: res.type === 'bullish' ? '#38bdf8' : '#f43f5e',
            shape: 'circle',
            text: '③',
          }
        );
      } else if (activePattern.name === 'Cup & Handle') {
        const res = activePattern as CupAndHandleResult;
        const lineSeries = chart.addSeries(LineSeries, {
          color: '#38bdf8',
          lineWidth: 3,
        });

        lineSeries.setData([
          { time: res.leftRim.time as Time, value: res.leftRim.price },
          { time: res.bottom.time as Time, value: res.bottom.price },
          { time: res.rightRim.time as Time, value: res.rightRim.price },
        ]);

        markers.push(
          {
            time: res.leftRim.time as Time,
            position: 'aboveBar',
            color: '#38bdf8',
            shape: 'circle',
            text: '① Left Rim',
          },
          {
            time: res.bottom.time as Time,
            position: 'belowBar',
            color: '#38bdf8',
            shape: 'circle',
            text: '② Cup Bottom',
          },
          {
            time: res.rightRim.time as Time,
            position: 'aboveBar',
            color: '#38bdf8',
            shape: 'circle',
            text: '③ Right Rim',
          }
        );
      } else if (activePattern.name === 'Head & Shoulders' || activePattern.name === 'Inverse Head & Shoulders') {
        const res = activePattern as HeadAndShouldersResult;
        const lineSeries = chart.addSeries(LineSeries, {
          color: res.type === 'bearish' ? '#f43f5e' : '#10b981',
          lineWidth: 3,
        });

        lineSeries.setData([
          { time: res.leftShoulder.time as Time, value: res.leftShoulder.price },
          { time: res.head.time as Time, value: res.head.price },
          { time: res.rightShoulder.time as Time, value: res.rightShoulder.price },
        ]);

        markers.push(
          {
            time: res.leftShoulder.time as Time,
            position: res.type === 'bearish' ? 'aboveBar' : 'belowBar',
            color: '#f43f5e',
            shape: 'circle',
            text: '① Left Shoulder',
          },
          {
            time: res.head.time as Time,
            position: res.type === 'bearish' ? 'aboveBar' : 'belowBar',
            color: '#f43f5e',
            shape: 'circle',
            text: '② Head',
          },
          {
            time: res.rightShoulder.time as Time,
            position: res.type === 'bearish' ? 'aboveBar' : 'belowBar',
            color: '#f43f5e',
            shape: 'circle',
            text: '③ Right Shoulder',
          }
        );
      }

      if (markers.length > 0) {
        createSeriesMarkers(candleSeries, markers);
      }
    }

    // Auto-fit content
    chart.timeScale().fitContent();

    // Handle window resize
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [candles, height, autoPatternsEnabled, activePattern]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-card-border bg-[#090d16] shadow-2xl">
      <PatternOverlay
        candles={candles}
        enabled={autoPatternsEnabled}
        onToggleEnabled={onTogglePatterns}
      />
      <div ref={containerRef} className="w-full" style={{ height }} />
    </div>
  );
}

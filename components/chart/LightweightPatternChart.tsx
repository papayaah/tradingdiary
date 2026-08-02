'use client';

import React from 'react';
import { CandleData } from '@/lib/chart/patterns';
import SharedTradingChart from './SharedTradingChart';

interface LightweightPatternChartProps {
  symbol?: string;
  candles: CandleData[];
  height?: number;
  autoPatternsEnabled?: boolean;
  onTogglePatterns?: () => void;
  interval?: string;
  onIntervalChange?: (newInterval: string) => void;
  currentDayOnly?: boolean;
  onToggleCurrentDayOnly?: (val: boolean) => void;
  providerBadge?: string;
  subtitle?: string;
  availableIntervals?: readonly string[];
  onLoadMoreHistory?: () => void;
  loadingMore?: boolean;
  hasMore?: boolean;
}

export default function LightweightPatternChart({
  symbol = 'PATTERN',
  candles,
  height = 360,
  autoPatternsEnabled = true,
  onTogglePatterns,
  interval,
  onIntervalChange,
  currentDayOnly,
  onToggleCurrentDayOnly,
  providerBadge,
  subtitle,
  availableIntervals,
  onLoadMoreHistory,
  loadingMore,
  hasMore,
}: LightweightPatternChartProps) {
  return (
    <SharedTradingChart
      symbol={symbol}
      candles={candles}
      height={height}
      autoPatternsEnabled={autoPatternsEnabled}
      onTogglePatterns={onTogglePatterns}
      interval={interval}
      onIntervalChange={onIntervalChange}
      availableIntervals={availableIntervals}
      currentDayOnly={currentDayOnly}
      onToggleCurrentDayOnly={onToggleCurrentDayOnly}
      providerBadge={providerBadge}
      subtitle={subtitle}
      onLoadMoreHistory={onLoadMoreHistory}
      loadingMore={loadingMore}
      hasMore={hasMore}
    />
  );
}

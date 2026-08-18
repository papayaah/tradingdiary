'use client';

import React from 'react';
import { CandleData } from '@/lib/chart/patterns';
import type { PatternId, PatternSettings } from '@/lib/scanner/patterns';
import SharedTradingChart from './SharedTradingChart';

interface LightweightPatternChartProps {
  symbol?: string;
  candles: CandleData[];
  height?: number;
  autoPatternsEnabled?: boolean;
  onTogglePatterns?: () => void;
  levelsEnabled?: boolean;
  onToggleLevels?: () => void;
  trendlinesEnabled?: boolean;
  onToggleTrendlines?: () => void;
  showOverlayControls?: boolean;
  interval?: string;
  onIntervalChange?: (newInterval: string) => void;
  currentDayOnly?: boolean;
  onToggleCurrentDayOnly?: (val: boolean) => void;
  providerBadge?: string;
  subtitle?: string;
  availableIntervals?: readonly string[];
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

export default function LightweightPatternChart({
  symbol = 'PATTERN',
  candles,
  height = 360,
  autoPatternsEnabled = true,
  onTogglePatterns,
  levelsEnabled,
  onToggleLevels,
  trendlinesEnabled,
  onToggleTrendlines,
  showOverlayControls,
  interval,
  onIntervalChange,
  currentDayOnly,
  onToggleCurrentDayOnly,
  providerBadge,
  subtitle,
  availableIntervals,
  selectedPatternId,
  minMovePercent,
  requiredCount,
  maxBodyOverlapPercent,
  scannerPatternMarkersEnabled,
  patternSettings,
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
      levelsEnabled={levelsEnabled}
      onToggleLevels={onToggleLevels}
      trendlinesEnabled={trendlinesEnabled}
      onToggleTrendlines={onToggleTrendlines}
      showOverlayControls={showOverlayControls}
      interval={interval}
      onIntervalChange={onIntervalChange}
      availableIntervals={availableIntervals}
      currentDayOnly={currentDayOnly}
      onToggleCurrentDayOnly={onToggleCurrentDayOnly}
      providerBadge={providerBadge}
      subtitle={subtitle}
      selectedPatternId={selectedPatternId}
      minMovePercent={minMovePercent}
      requiredCount={requiredCount}
      maxBodyOverlapPercent={maxBodyOverlapPercent}
      scannerPatternMarkersEnabled={scannerPatternMarkersEnabled}
      patternSettings={patternSettings}
      onLoadMoreHistory={onLoadMoreHistory}
      loadingMore={loadingMore}
      hasMore={hasMore}
    />
  );
}

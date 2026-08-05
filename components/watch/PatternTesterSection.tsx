'use client';

import React from 'react';
import { Search, Play, RefreshCw, Sparkles } from 'lucide-react';
import LightweightPatternChart from '@/components/chart/LightweightPatternChart';
import {
  getPatternDefinition,
  getPatternMinMovePercent,
  scanAllPatterns,
  DEFAULT_PATTERN_SETTINGS,
  type PatternId,
  type PatternSettings,
} from '@/lib/scanner/patterns';
import PatternGuidePanel from './PatternGuidePanel';
import type { Candle, PatternMatch } from './watchAnalysis';

interface PatternTestResult {
  success: boolean;
  patternMatched: 'bullish' | 'bearish' | 'none';
  message: string;
  candles: Candle[];
  provider: string;
  allMatches: PatternMatch[];
}

export interface PatternTesterSectionProps {
  testSymbol: string;
  onSymbolChange: (sym: string) => void;
  testInterval: string;
  onIntervalChange: (iv: string) => void;
  testSessionFilter: 'all' | 'rth' | 'ext';
  onSessionFilterChange: (session: 'all' | 'rth' | 'ext') => void;
  testMinMove: number;
  onMinMoveChange: (val: number) => void;
  isTesting: boolean;
  onRunTest: (e: React.FormEvent) => void;
  testResult: PatternTestResult | null;
  testerCandles: Candle[];
  onLoadMoreHistory?: () => void;
  loadingMore?: boolean;
  hasMore?: boolean;
  autoPatternsEnabled: boolean;
  onToggleAutoPatterns: () => void;
  testCurrentDayOnly: boolean;
  onToggleCurrentDayOnly: (val: boolean) => void;
  selectedPatternId?: PatternId;
  onPatternChange?: (id: PatternId) => void;
  requiredCount?: number;
  onRequiredCountChange?: (val: number) => void;
  maxBodyOverlapPercent?: number;
  onMaxBodyOverlapChange?: (val: number) => void;
  patternSettings?: PatternSettings;
  onPatternSettingsChange?: (settings: PatternSettings) => void;
}

export function PatternTesterSection({
  testSymbol,
  onSymbolChange,
  testInterval,
  onIntervalChange,
  testSessionFilter,
  onSessionFilterChange,
  testMinMove,
  onMinMoveChange,
  isTesting,
  onRunTest,
  testResult,
  testerCandles,
  onLoadMoreHistory,
  loadingMore = false,
  hasMore = false,
  autoPatternsEnabled,
  onToggleAutoPatterns,
  testCurrentDayOnly,
  onToggleCurrentDayOnly,
  selectedPatternId = 'consecutive',
  onPatternChange,
  requiredCount = 3,
  onRequiredCountChange,
  maxBodyOverlapPercent = 100,
  onMaxBodyOverlapChange,
  patternSettings = DEFAULT_PATTERN_SETTINGS,
  onPatternSettingsChange,
}: PatternTesterSectionProps) {
  const chartCandles = testerCandles;
  const selectedMinMove = getPatternMinMovePercent(
    patternSettings,
    selectedPatternId,
    testMinMove,
  );
  const detectorMatches = React.useMemo(
    () => scanAllPatterns(
      chartCandles,
      selectedMinMove,
      requiredCount,
      selectedPatternId,
      maxBodyOverlapPercent,
      patternSettings,
    ),
    [
      chartCandles,
      maxBodyOverlapPercent,
      requiredCount,
      selectedPatternId,
      selectedMinMove,
      patternSettings,
    ],
  );
  const selectedPatternName = getPatternDefinition(selectedPatternId).name;
  const volumeBarCount = React.useMemo(
    () => chartCandles.filter((candle) => Number.isFinite(candle.volume) && candle.volume > 0).length,
    [chartCandles],
  );
  const hasVolumeData = volumeBarCount > 0;

  return (
    <div className="space-y-4">
      {onPatternChange ? (
        <PatternGuidePanel
          value={selectedPatternId}
          onChange={onPatternChange}
          description="Test the same detector settings used by live Market Watch and backend alerts."
          minMovePercent={selectedMinMove}
          requiredCount={requiredCount}
          maxBodyOverlapPercent={maxBodyOverlapPercent}
          onMinMoveChange={onMinMoveChange}
          onRequiredCountChange={onRequiredCountChange}
          onMaxBodyOverlapChange={onMaxBodyOverlapChange}
          patternSettings={patternSettings}
          onPatternSettingsChange={onPatternSettingsChange}
        />
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Control Sidebar Form */}
      <div className="lg:col-span-4 space-y-4">
        <div className="bg-card-bg/60 backdrop-blur-md border border-card-border/60 shadow-xl rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-accent/15 text-accent">
              <Search size={16} />
            </div>
            <h2 className="text-base font-bold text-foreground">Pattern Tester</h2>
          </div>
          <p className="text-xs text-muted mb-5">
            Fetch candles for any symbol immediately and verify whether it matches the selected pattern.
          </p>

          <form onSubmit={onRunTest} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                Stock Symbol
              </label>
              <input
                type="text"
                placeholder="e.g. AAPL, TSLA, NQ=F"
                value={testSymbol}
                onChange={(e) => onSymbolChange(e.target.value)}
                className="w-full bg-muted-bg border border-card-border focus:border-accent focus:ring-1 focus:ring-accent rounded-xl px-3.5 py-2.5 text-xs text-foreground outline-none transition-all font-bold uppercase"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                  Interval
                </label>
                <select
                  value={testInterval}
                  onChange={(e) => onIntervalChange(e.target.value)}
                  className="w-full bg-muted-bg border border-card-border focus:border-accent rounded-xl px-3 py-2 text-xs font-bold text-foreground cursor-pointer outline-none"
                >
                  <option value="1m">1m</option>
                  <option value="5m">5m</option>
                  <option value="10m">10m</option>
                  <option value="15m">15m</option>
                  <option value="1h">1h</option>
                  <option value="1d">1d</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                  Trading Session
                </label>
                <select
                  value={testSessionFilter}
                  onChange={(e) => onSessionFilterChange(
                    e.target.value as 'all' | 'rth' | 'ext',
                  )}
                  className="w-full bg-muted-bg border border-card-border focus:border-accent rounded-xl px-3 py-2 text-xs font-bold text-foreground cursor-pointer outline-none"
                >
                  <option value="all">All Hours</option>
                  <option value="rth">Regular Trading Hours (RTH)</option>
                  <option value="ext">Extended Hours (Pre/Post-Market)</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isTesting}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl py-3 text-xs font-bold transition-all disabled:opacity-50 shadow-md"
            >
              {isTesting ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Fetching data...
                </>
              ) : (
                <>
                  <Play size={14} fill="currentColor" /> Check Pattern Now
                </>
              )}
            </button>
          </form>

          {/* Test Status Badge */}
          {testResult && (
            <div className="mt-5 pt-4 border-t border-card-border/40 text-xs">
              <div className="flex items-center justify-between text-muted">
                <span>Provider: <strong className="text-foreground font-mono">{testResult.provider}</strong></span>
                <span>Status: <strong className={testResult.success ? 'text-emerald-400' : 'text-rose-400'}>{testResult.success ? 'Success' : 'Failed'}</strong></span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Chart Area */}
      <div className="lg:col-span-8 space-y-4">
        {testResult && testResult.success && chartCandles.length > 0 ? (
          <>
            <div
              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-[11px] ${
                selectedPatternId === 'volume-expansion' && !hasVolumeData
                  ? 'border-amber-500/40 bg-amber-500/10'
                  : 'border-card-border/60 bg-card-bg/50'
              }`}
              role="status"
              aria-live="polite"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-foreground">
                  {detectorMatches.length > 0
                    ? `${detectorMatches.length} ${selectedPatternName} ${detectorMatches.length === 1 ? 'match' : 'matches'}`
                    : `No ${selectedPatternName} matches`}
                </span>
                <span className={hasVolumeData ? 'text-muted' : 'text-amber-300'}>
                  Volume: {volumeBarCount}/{chartCandles.length} loaded bars
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onToggleAutoPatterns}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${
                    autoPatternsEnabled
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-card-bg border-card-border text-muted hover:text-foreground'
                  }`}
                  title="Toggle Chart Pattern Recognition & Overlays"
                >
                  <Sparkles size={13} className={autoPatternsEnabled ? 'text-amber-400 animate-pulse' : ''} />
                  <span>Auto Patterns</span>
                </button>

                <span className="text-muted hidden sm:inline">
                  {selectedPatternId === 'volume-expansion' && !hasVolumeData
                    ? 'No usable volume data available.'
                    : detectorMatches.length > 0
                      ? 'Arrows mark completing candles.'
                      : 'Try a lower threshold or interval.'}
                </span>
              </div>
            </div>
            <LightweightPatternChart
              symbol={testSymbol}
              candles={chartCandles}
              height={380}
              autoPatternsEnabled={autoPatternsEnabled}
              onTogglePatterns={onToggleAutoPatterns}
              interval={testInterval}
              onIntervalChange={onIntervalChange}
              currentDayOnly={testCurrentDayOnly}
              onToggleCurrentDayOnly={onToggleCurrentDayOnly}
              providerBadge={testResult.provider}
              selectedPatternId={selectedPatternId}
              minMovePercent={selectedMinMove}
              requiredCount={requiredCount}
              maxBodyOverlapPercent={maxBodyOverlapPercent}
              patternSettings={patternSettings}
              scannerPatternMarkersEnabled
              subtitle={`${chartCandles.length} candles loaded (${testInterval})`}
              onLoadMoreHistory={onLoadMoreHistory}
              loadingMore={loadingMore}
              hasMore={hasMore}
            />
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-card-border p-12 text-center text-xs text-muted bg-card-bg/20 flex flex-col items-center justify-center min-h-[380px]">
            <Sparkles size={24} className="text-accent/60 mb-2" />
            <span className="font-bold text-foreground">No pattern test run yet</span>
            <span className="text-[11px] mt-1 max-w-sm">
              Enter a symbol on the left and click &quot;Check Pattern Now&quot; to load recent candles and visualize patterns.
            </span>
          </div>
        )}
      </div>
    </div>
  </div>
);
}

export default React.memo(PatternTesterSection);

'use client';

import React, { useMemo } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { detectAllPatterns, CandleData, DetectedPattern } from '@/lib/chart/patterns';
import { Sparkles, Target, TrendingUp, TrendingDown, Eye, EyeOff } from 'lucide-react';

interface PatternOverlayProps {
  candles: CandleData[];
  enabled: boolean;
  onToggleEnabled?: () => void;
}

export default function PatternOverlay({
  candles,
  enabled,
  onToggleEnabled,
}: PatternOverlayProps) {
  const scanResult = useMemo(() => {
    if (!enabled || !candles || candles.length < 15) {
      return { patterns: [], totalDetected: 0 };
    }
    return detectAllPatterns(candles);
  }, [candles, enabled]);

  const activePattern = scanResult.patterns[0] as DetectedPattern | undefined;

  if (!enabled || !activePattern) {
    return null;
  }

  const isBullish =
    activePattern.name === 'Cup & Handle' ||
    activePattern.name === 'Double Bottom (W)' ||
    (activePattern.name === 'Inverse Head & Shoulders');

  return (
    <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-card-bg/90 backdrop-blur-md border border-card-border px-3 py-1.5 rounded-xl shadow-lg text-sm animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-1.5">
        <Sparkles size={14} className="text-amber-400 animate-pulse" />
        <span className="font-bold text-foreground">{activePattern.name}</span>
        <span
          className={`px-1.5 py-0.5 rounded text-xs font-semibold flex items-center gap-1 ${
            isBullish ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
          }`}
        >
          {isBullish ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {isBullish ? 'BULLISH' : 'BEARISH'}
        </span>
      </div>

      <div className="h-3 w-px bg-card-border mx-1" />

      <div className="flex items-center gap-3 text-xs font-mono">
        <div>
          <span className="text-muted">Breakout: </span>
          <span className="font-bold text-foreground">${Number(activePattern.breakoutPrice).toFixed(2)}</span>
        </div>
        <div>
          <span className="text-muted">Target: </span>
          <span className="font-bold text-emerald-400">${Number(activePattern.targetPrice).toFixed(2)}</span>
        </div>
        <div>
          <span className="text-muted">Stop: </span>
          <span className="font-bold text-rose-400">${Number(activePattern.stopLossPrice).toFixed(2)}</span>
        </div>
        <div className="text-muted text-xs bg-muted-bg px-1.5 py-0.5 rounded font-sans">
          {activePattern.confidence}% match
        </div>
      </div>

      {onToggleEnabled && (
        <button
          onClick={onToggleEnabled}
          className="ml-1 p-1 hover:bg-muted-bg rounded text-muted hover:text-foreground transition-colors"
          title="Hide Pattern Overlays"
        >
          <EyeOff size={13} />
        </button>
      )}
    </div>
  );
}

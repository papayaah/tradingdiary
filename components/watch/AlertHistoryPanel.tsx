'use client';

import React, { useEffect, useState } from 'react';
import { History } from 'lucide-react';

interface AlertCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AlertHistoryItem {
  id: string;
  createdAt: number;
  symbol: string;
  interval: string;
  type: 'bullish' | 'bearish';
  details: string;
  price: number;
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
    <span title={new Date(timestamp).toLocaleString()}>
      {formatTimeAgo(timestamp, now)}
    </span>
  );
});

const MiniCandles = React.memo(function MiniCandles({ candles }: { candles: AlertCandle[] }) {
  if (candles.length === 0) return null;

  let maxValue = Number.NEGATIVE_INFINITY;
  let minValue = Number.POSITIVE_INFINITY;
  for (const candle of candles) {
    maxValue = Math.max(maxValue, candle.high);
    minValue = Math.min(minValue, candle.low);
  }

  const range = maxValue - minValue || 1;
  const height = 28;
  const candleWidth = 5;
  const gap = 3;
  const step = candleWidth + gap;
  const totalWidth = candles.length * step - gap + 8;
  const getScaledY = (price: number) =>
    2 + (height - 4) - ((price - minValue) / range) * (height - 4);

  return (
    <svg width={totalWidth} height={height} className="overflow-visible select-none">
      {candles.map((candle, index) => {
        const x = index * step + 4;
        const color = candle.close >= candle.open ? '#10b981' : '#f43f5e';
        const openY = getScaledY(candle.open);
        const closeY = getScaledY(candle.close);
        return (
          <g key={candle.time}>
            <line
              x1={x + candleWidth / 2}
              y1={getScaledY(candle.high)}
              x2={x + candleWidth / 2}
              y2={getScaledY(candle.low)}
              stroke={color}
              strokeWidth={1}
            />
            <rect
              x={x}
              y={Math.min(openY, closeY)}
              width={candleWidth}
              height={Math.max(1.5, Math.abs(openY - closeY))}
              fill={color}
              rx={0.5}
            />
          </g>
        );
      })}
    </svg>
  );
});

function AlertHistoryPanel({
  alerts,
  onAlertClick,
  onClear,
}: AlertHistoryPanelProps) {
  return (
    <div className="lg:col-span-4">
      <div className="bg-card-bg border border-card-border shadow-xl rounded-2xl p-4 md:p-5 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <History size={18} className="text-accent" /> Alert History
          </h2>
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
          <div className="text-center py-12 text-muted text-xs flex-1 flex items-center justify-center border border-dashed border-card-border rounded-xl">
            No alerts triggered in this session.
          </div>
        ) : (
          <div className="space-y-3 overflow-y-auto flex-1 pr-1 max-h-[500px]">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                onClick={() => onAlertClick(alert)}
                className={`p-3 rounded-xl border flex flex-col justify-between gap-2 text-xs cursor-pointer hover:scale-[1.02] active:scale-[0.99] hover:border-card-border/80 transition-all select-none ${
                  alert.type === 'bullish'
                    ? 'bg-emerald-950/20 border-emerald-900/30 hover:bg-emerald-950/30'
                    : 'bg-rose-950/20 border-rose-900/30 hover:bg-rose-950/30'
                }`}
                title="Click to locate and expand chart"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground">{alert.symbol}</span>
                      <span className="bg-muted-bg text-muted px-1.5 py-0.5 rounded text-[10px] font-mono">
                        {alert.interval}
                      </span>
                      <span
                        className={`font-semibold ${
                          alert.type === 'bullish' ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {alert.type === 'bullish' ? 'Ascending' : 'Descending'}
                      </span>
                    </div>
                    {alert.candles && alert.candles.length > 0 && (
                      <div className="flex items-center bg-black/40 px-1.5 py-0.5 rounded border border-card-border/30 shadow-inner">
                        <MiniCandles candles={alert.candles} />
                      </div>
                    )}
                  </div>
                  <p className="text-muted mt-1 text-[11px] leading-relaxed">{alert.details}</p>
                </div>

                <div className="flex items-center justify-between gap-4 font-mono text-[10px] text-muted border-t border-card-border/20 pt-1.5">
                  <span>Price: ${alert.price.toFixed(2)}</span>
                  <TimeAgo timestamp={alert.createdAt} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(AlertHistoryPanel);

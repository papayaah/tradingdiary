'use client';

import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import type { TransactionRecord } from '@/lib/db/schema';
import { timeToSeconds, type PnLSnapshot } from '@/lib/replay/engine';

const ROW_HEIGHT = 48;
const LEFT_LABEL_WIDTH = 80;
const RIGHT_PADDING = 16;
const AXIS_HEIGHT = 28;
const PNL_AREA_HEIGHT = 60;
const TOP_PADDING = 8;

const SYMBOL_COLORS = [
  '#818cf8', '#f59e0b', '#06b6d4', '#ec4899',
  '#84cc16', '#f97316', '#a78bfa', '#14b8a6',
  '#e879f7', '#fb923c',
];

interface ReplayTimelineProps {
  transactions: TransactionRecord[];
  symbols: string[];
  currentTimeSeconds: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  snapshots: PnLSnapshot[];
  prevVisibleCount: number;
  onSeek?: (timeSeconds: number) => void;
}

export default function ReplayTimeline({
  transactions,
  symbols,
  currentTimeSeconds,
  startTimeSeconds,
  endTimeSeconds,
  snapshots,
  prevVisibleCount,
  onSeek,
}: ReplayTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const timelineWidth = width - LEFT_LABEL_WIDTH - RIGHT_PADDING;
  const timeRange = endTimeSeconds - startTimeSeconds;
  const symbolsHeight = symbols.length * ROW_HEIGHT;
  const totalHeight = TOP_PADDING + symbolsHeight + PNL_AREA_HEIGHT + AXIS_HEIGHT;

  const timeToX = (seconds: number) => {
    if (isNaN(seconds) || timeRange <= 0) return LEFT_LABEL_WIDTH;
    const fraction = (seconds - startTimeSeconds) / timeRange;
    return LEFT_LABEL_WIDTH + fraction * timelineWidth;
  };

  // Time axis ticks (dynamic interval to avoid overlaps)
  const ticks = useMemo(() => {
    const result: { seconds: number; label: string }[] = [];
    const minSpacing = 80; // Minimum pixels between labels
    const maxTicks = Math.floor(timelineWidth / minSpacing);

    // Possible "nice" intervals in seconds
    const possibleIntervals = [
      60,          // 1m
      300,         // 5m
      600,         // 10m
      900,         // 15m
      1800,        // 30m
      3600,        // 1h
      7200,        // 2h
      14400,       // 4h
      28800,       // 8h
      43200,       // 12h
      86400        // 24h
    ];

    let interval = 1800; // Default to 30m
    for (const cand of possibleIntervals) {
      if (timeRange / cand <= maxTicks) {
        interval = cand;
        break;
      }
    }

    const startTick = Math.ceil(startTimeSeconds / interval) * interval;
    for (let s = startTick; s <= endTimeSeconds; s += interval) {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const ampm = h >= 12 ? 'PM' : 'AM';
      result.push({
        seconds: s,
        label: `${h12}:${String(m).padStart(2, '0')} ${ampm}`,
      });
    }
    return result;
  }, [startTimeSeconds, endTimeSeconds, timelineWidth, timeRange]);

  // Annotate transactions with their time in seconds
  const annotated = useMemo(
    () =>
      transactions.map((t) => ({
        ...t,
        timeSeconds: timeToSeconds(t.time),
      })),
    [transactions]
  );

  const visibleTrades = annotated.filter(
    (t) => t.timeSeconds <= currentTimeSeconds
  );
  const futureTrades = annotated.filter(
    (t) => t.timeSeconds > currentTimeSeconds
  );

  // Stable P&L scale based on full day range (prevents jitter)
  const pnlScale = useMemo(() => {
    if (snapshots.length === 0) return { maxAbs: 1, scale: 1 };
    const allValues = snapshots.map((s) => s.cumulativeNetPnL);
    const maxAbs = Math.max(
      Math.abs(Math.min(...allValues)),
      Math.abs(Math.max(...allValues)),
      1
    );
    return { maxAbs, scale: (PNL_AREA_HEIGHT / 2 - 4) / maxAbs };
  }, [snapshots]);

  const pnlMid = TOP_PADDING + symbolsHeight + 4 + PNL_AREA_HEIGHT / 2;

  // P&L polyline points (clipped to current time, stable scale)
  const pnlPoints = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    for (const snap of snapshots) {
      if (snap.timeSeconds > currentTimeSeconds) break;
      pts.push({
        x: timeToX(snap.timeSeconds),
        y: pnlMid - snap.cumulativeNetPnL * pnlScale.scale,
      });
    }
    return pts;
  }, [snapshots, currentTimeSeconds, pnlMid, pnlScale.scale, timeToX]);

  // P&L Area path for gradient fill
  const pnlAreaPath = useMemo(() => {
    if (pnlPoints.length < 2) return '';
    const startX = pnlPoints[0].x;
    const endX = pnlPoints[pnlPoints.length - 1].x;
    const pointsStr = pnlPoints.map((p) => `${p.x},${p.y}`).join(' ');
    return `M ${startX},${pnlMid} L ${pointsStr} L ${endX},${pnlMid} Z`;
  }, [pnlPoints, pnlMid]);

  const cursorX = timeToX(currentTimeSeconds);

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!onSeek) return;
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      // Only respond to clicks in the timeline area
      if (clickX < LEFT_LABEL_WIDTH || clickX > width - RIGHT_PADDING) return;
      const fraction = (clickX - LEFT_LABEL_WIDTH) / timelineWidth;
      const timeSeconds = startTimeSeconds + fraction * timeRange;
      onSeek(Math.round(Math.max(startTimeSeconds, Math.min(endTimeSeconds, timeSeconds))));
    },
    [onSeek, width, timelineWidth, startTimeSeconds, endTimeSeconds, timeRange]
  );

  return (
    <div ref={containerRef} className="w-full relative group">
      <svg
        width={width}
        height={totalHeight}
        className="select-none overflow-visible"
        style={onSeek ? { cursor: 'crosshair' } : undefined}
        onClick={handleClick}
      >
        <defs>
          <linearGradient id="pnlGradientProfit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--profit)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="var(--profit)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="pnlGradientLoss" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--loss)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--loss)" stopOpacity="0.15" />
          </linearGradient>
        </defs>

        {/* Row backgrounds */}
        {symbols.map((sym, i) => (
          <g key={sym}>
            <rect
              x={0}
              y={TOP_PADDING + i * ROW_HEIGHT}
              width={width}
              height={ROW_HEIGHT}
              fill="transparent"
              className="hover:fill-[var(--sidebar-hover)] transition-colors duration-200"
            />
            {i % 2 === 1 && (
              <rect
                x={LEFT_LABEL_WIDTH}
                y={TOP_PADDING + i * ROW_HEIGHT}
                width={timelineWidth}
                height={ROW_HEIGHT}
                fill="var(--muted-bg)"
                opacity={0.1}
                pointerEvents="none"
              />
            )}
            {/* Row divider */}
            <line
              x1={LEFT_LABEL_WIDTH}
              y1={TOP_PADDING + (i + 1) * ROW_HEIGHT}
              x2={width - RIGHT_PADDING}
              y2={TOP_PADDING + (i + 1) * ROW_HEIGHT}
              stroke="var(--card-border)"
              strokeWidth={1}
              opacity={0.5}
            />
            {/* Symbol label */}
            <text
              x={LEFT_LABEL_WIDTH - 12}
              y={TOP_PADDING + i * ROW_HEIGHT + ROW_HEIGHT / 2}
              textAnchor="end"
              dominantBaseline="central"
              fill={SYMBOL_COLORS[i % SYMBOL_COLORS.length]}
              fontSize={11}
              fontWeight={700}
              letterSpacing="0.02em"
              fontFamily="var(--font-geist-sans), system-ui, sans-serif"
            >
              {sym}
            </text>
            {/* Symbol lane color accent */}
            <rect
              x={LEFT_LABEL_WIDTH}
              y={TOP_PADDING + i * ROW_HEIGHT + 2}
              width={2}
              height={ROW_HEIGHT - 4}
              fill={SYMBOL_COLORS[i % SYMBOL_COLORS.length]}
              opacity={0.5}
              rx={1}
            />
          </g>
        ))}

        {/* Time axis ticks */}
        {ticks.map((tick) => {
          const x = timeToX(tick.seconds);
          return (
            <g key={tick.seconds}>
              <line
                x1={x}
                y1={TOP_PADDING}
                x2={x}
                y2={TOP_PADDING + symbolsHeight}
                stroke="var(--card-border)"
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.3}
              />
              <text
                x={x}
                y={totalHeight - 8}
                textAnchor="middle"
                fill="var(--muted)"
                fontSize={9}
                fontWeight={500}
                fontFamily="var(--font-geist-sans), system-ui, sans-serif"
              >
                {tick.label}
              </text>
            </g>
          );
        })}

        {/* Future trades (ghosted) */}
        {futureTrades.map((t) => {
          const symIdx = symbols.indexOf(t.symbol);
          if (symIdx < 0) return null;
          const x = timeToX(t.timeSeconds);
          const y = TOP_PADDING + symIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
          return (
            <circle
              key={t.tradeId}
              cx={x}
              cy={y}
              r={3}
              fill="var(--muted)"
              opacity={0.12}
            />
          );
        })}

        {/* Visible trades */}
        {visibleTrades.map((t, idx) => {
          const symIdx = symbols.indexOf(t.symbol);
          if (symIdx < 0) return null;
          const x = timeToX(t.timeSeconds);
          const y = TOP_PADDING + symIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
          const isBuy = t.side === 'BUYTOOPEN' || t.side === 'BUYTOCLOSE';
          const r = Math.max(3.5, Math.min(8, Math.abs(t.quantity) / (t.price < 5 ? 1000 : 500)));
          const isNew = idx >= prevVisibleCount;

          return (
            <circle
              key={t.tradeId}
              cx={x}
              cy={y}
              r={r}
              fill={isBuy ? 'var(--profit)' : 'var(--loss)'}
              stroke="var(--card-bg)"
              strokeWidth={1.5}
              opacity={0.9}
              className={isNew ? 'trade-appear' : undefined}
              style={isNew ? { transformOrigin: `${x}px ${y}px` } : undefined}
            >
              <title>
                {t.symbol} {t.side} {Math.abs(t.quantity)}@{t.price.toFixed(2)} {t.time}
              </title>
            </circle>
          );
        })}

        {/* P&L Area Gradients */}
        {pnlAreaPath && (
          <>
            <path d={pnlAreaPath} fill="url(#pnlGradientProfit)" pointerEvents="none" />
            <path d={pnlAreaPath} fill="url(#pnlGradientLoss)" pointerEvents="none" />
          </>
        )}

        {/* P&L mini-chart — baseline */}
        <line
          x1={LEFT_LABEL_WIDTH}
          y1={pnlMid}
          x2={width - RIGHT_PADDING}
          y2={pnlMid}
          stroke="var(--card-border)"
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.5}
        />
        <text
          x={LEFT_LABEL_WIDTH - 12}
          y={pnlMid}
          textAnchor="end"
          dominantBaseline="central"
          fill="var(--muted)"
          fontSize={10}
          fontWeight={600}
          fontFamily="var(--font-geist-sans), system-ui, sans-serif"
        >
          P&L
        </text>

        {pnlPoints.length > 1 && (
          <polyline
            points={pnlPoints.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={
              pnlPoints[pnlPoints.length - 1].y < pnlMid
                ? 'var(--profit)'
                : 'var(--loss)'
            }
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Current time cursor */}
        {!isNaN(cursorX) && (
          <g>
            <line
              x1={cursorX}
              y1={TOP_PADDING}
              x2={cursorX}
              y2={TOP_PADDING + symbolsHeight + PNL_AREA_HEIGHT}
              stroke="var(--accent)"
              strokeWidth={2}
              opacity={0.8}
            />
            <circle
              cx={cursorX}
              cy={TOP_PADDING + symbolsHeight + PNL_AREA_HEIGHT}
              r={4}
              fill="var(--accent)"
            />
          </g>
        )}
      </svg>
    </div>
  );
}

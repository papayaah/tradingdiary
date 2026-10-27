'use client';

import { useId, useMemo } from 'react';
import type { OHLCCandle } from '@/lib/chart/types';
import type { TransactionRecord } from '@/lib/db/schema';
import { etWallClockToEpochSeconds } from '@/lib/chart/execution-time';

const VIEW_W = 880;
const PAD_L = 8;
const PAD_R = 66;
const HIGHLIGHT_STROKE = 3.5;

function fmtET(epoch: number): string {
  return new Date(epoch * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
}

function isBuy(side: TransactionRecord['side']): boolean {
  return side === 'BUYTOOPEN' || side === 'BUYTOCLOSE';
}

interface PaperCandleChartProps {
  candles: OHLCCandle[];
  transactions: TransactionRecord[];
  /** Trading day (YYYYMMDD) the fills' wall-clock times resolve against. */
  date: string;
  highlightedTransactionId?: string | null;
  onHover?: (transactionId: string | null) => void;
  height?: number;
}

/**
 * Hand-drawn, non-interactive candlestick snapshot in the paper theme. Candles
 * are SVG with a wobble filter; fills land at their price on the owning candle,
 * overlaps spread out, and an entry→exit line connects the average buy and sell.
 */
export default function PaperCandleChart({
  candles,
  transactions,
  date,
  highlightedTransactionId = null,
  onHover,
  height = 320,
}: PaperCandleChartProps) {
  const rawId = useId();
  const filterId = `pc-rough-${rawId.replace(/[:]/g, '')}`;
  const PRICE_H = height;
  const VOL_H = Math.round(height * 0.22);
  const VOL_TOP = PRICE_H + 12;
  const VIEW_H = VOL_TOP + VOL_H + 28;

  const model = useMemo(() => {
    if (candles.length === 0) return null;
    const n = candles.length;
    let min = Infinity, max = -Infinity, maxVol = 0;
    for (const c of candles) {
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
      if (c.volume > maxVol) maxVol = c.volume;
    }
    const pad = (max - min) * 0.12 || 1;
    min -= pad; max += pad;
    const plotW = VIEW_W - PAD_L - PAD_R;
    const step = plotW / n;
    const bodyW = Math.max(1.5, step * 0.62);
    const yOf = (p: number) => PRICE_H * (1 - (p - min) / (max - min)) + 6;
    const xOf = (i: number) => PAD_L + step * i + step / 2;

    // bucket each fill into its owning candle (last candle whose start <= fill time)
    const fills = transactions.map((t) => {
      const epoch = etWallClockToEpochSeconds(date, t.time);
      let idx = 0;
      if (epoch != null) {
        for (let i = 0; i < n; i += 1) {
          if (candles[i].time <= epoch) idx = i; else break;
        }
      }
      return { t, idx, buy: isBuy(t.side) };
    });
    const groups: Record<number, number[]> = {};
    fills.forEach((f, i) => { (groups[f.idx] = groups[f.idx] || []).push(i); });

    return { n, min, max, maxVol, plotW, step, bodyW, yOf, xOf, fills, groups };
  }, [candles, transactions, date, PRICE_H]);

  if (!model) {
    return (
      <div className="flex items-center justify-center py-16 text-[0.9rem] text-ink-soft" style={{ minHeight: height }}>
        No chart data for this day.
      </div>
    );
  }

  const { n, min, max, maxVol, yOf, xOf, bodyW, fills, groups } = model;

  const buys = fills.filter((f) => f.buy);
  const sells = fills.filter((f) => !f.buy);
  const avgPoint = (arr: typeof fills) => {
    if (!arr.length) return null;
    const x = arr.reduce((s, f) => s + xOf(f.idx), 0) / arr.length;
    const y = arr.reduce((s, f) => s + yOf(f.t.price), 0) / arr.length;
    return { x, y };
  };
  const eP = avgPoint(buys);
  const xP = avgPoint(sells);

  const priceLabels = Array.from({ length: 5 }, (_, g) => min + (max - min) * g / 4);
  const timeTickIdx = [0, 0.25, 0.5, 0.75, 0.99].map((f) => Math.round(f * (n - 1)));

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" style={{ width: '100%', height }} role="img" aria-label="Trade price chart">
      <defs>
        <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018 0.022" numOctaves={2} seed={4} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.1" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>

      <g filter={`url(#${filterId})`}>
        {priceLabels.map((p, g) => (
          <line key={`g${g}`} x1={PAD_L} y1={yOf(p)} x2={VIEW_W - PAD_R} y2={yOf(p)} stroke="var(--line-soft)" strokeWidth={1.3} />
        ))}

        {candles.map((c, i) => {
          const up = c.close >= c.open;
          const fill = up ? 'var(--hl-green)' : 'var(--hl-red)';
          const stroke = up ? 'var(--paper-profit)' : 'var(--paper-loss)';
          const x = xOf(i);
          const yO = yOf(c.open), yC = yOf(c.close);
          const bt = Math.min(yO, yC), bh = Math.max(2, Math.abs(yO - yC)), bb = bt + bh;
          const sw = n > 110 ? 1.2 : 2;
          const vh = maxVol ? (c.volume / maxVol) * VOL_H : 0;
          return (
            <g key={`c${i}`}>
              <line x1={x} y1={yOf(c.high)} x2={x} y2={bt} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
              <line x1={x} y1={bb} x2={x} y2={yOf(c.low)} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
              <rect x={x - bodyW / 2} y={bt} width={bodyW} height={bh} rx={n > 110 ? 1 : 2.5} fill={fill} stroke={stroke} strokeWidth={sw} />
              <rect x={x - bodyW / 2} y={VOL_TOP + VOL_H - vh} width={bodyW} height={vh} rx={1} fill={up ? 'var(--hl-green)' : 'var(--hl-red)'} opacity={0.75} />
            </g>
          );
        })}

        {eP && xP && (
          <line x1={eP.x} y1={eP.y} x2={xP.x} y2={xP.y} stroke="var(--ink-soft)" strokeWidth={2} strokeDasharray="7 6" opacity={0.8} />
        )}

        {fills.map((f, i) => {
          const g = groups[f.idx];
          const within = g.indexOf(i);
          const spread = (g.length - 1) * 7;
          const x = xOf(f.idx) + (within * 7 - spread / 2);
          const y = yOf(f.t.price);
          const col = f.buy ? 'var(--paper-profit)' : 'var(--paper-loss)';
          const fc = f.buy ? 'var(--hl-green)' : 'var(--hl-red)';
          const active = highlightedTransactionId === f.t.tradeId;
          return (
            <g
              key={f.t.tradeId}
              onMouseEnter={() => onHover?.(f.t.tradeId)}
              onMouseLeave={() => onHover?.(null)}
              style={{ cursor: 'default' }}
            >
              <circle cx={x} cy={y} r={11} fill="none" stroke="var(--today)" strokeWidth={3} opacity={active ? 1 : 0} />
              <circle cx={x} cy={y} r={5.5} fill={fc} stroke={col} strokeWidth={active ? HIGHLIGHT_STROKE : 2.5} />
            </g>
          );
        })}
      </g>

      {priceLabels.map((p, g) => (
        <text key={`pl${g}`} x={VIEW_W - PAD_R + 8} y={yOf(p) + 5} fontSize={15} fill="var(--ink-soft)" style={{ fontFamily: 'var(--font-hand)' }}>
          {p.toFixed(2)}
        </text>
      ))}
      {timeTickIdx.map((i, k) => (
        <text key={`tl${k}`} x={xOf(i)} y={PRICE_H + 34} fontSize={14} textAnchor="middle" fill="var(--ink-soft)" style={{ fontFamily: 'var(--font-hand)' }}>
          {fmtET(candles[i].time)}
        </text>
      ))}
    </svg>
  );
}

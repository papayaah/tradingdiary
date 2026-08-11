import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { BrandHeader } from '../components/BrandHeader';
import { getVideoTheme } from '../theme';

const REPLAY_CANDLES = [
  { open: 150.0, high: 152.0, low: 149.5, close: 151.8, time: '09:30 AM', pnl: null }, // 1st Green Candle (No P&L)
  { open: 151.8, high: 154.5, low: 151.5, close: 153.8, time: '09:35 AM', action: 'BUY', pnl: 180.0 }, // 2nd Green Candle: BUY! (+ $180.00)
  { open: 153.8, high: 154.0, low: 149.2, close: 150.0, time: '09:40 AM', pnl: -340.0 }, // RED Candle! (Dips to RED -$340.00)
  { open: 150.0, high: 156.0, low: 149.8, close: 155.5, time: '09:45 AM', pnl: 530.0 }, // Green Candle (+ $530.00)
  { open: 155.5, high: 160.5, low: 155.2, close: 159.8, time: '09:50 AM', pnl: 1420.0 }, // Green Candle (+ $1,420.00)
  { open: 159.8, high: 165.2, low: 159.5, close: 164.5, time: '09:55 AM', action: 'SELL', pnl: 2380.0 }, // Green Candle: SELL! (+ $2,380.00)
];

export function ReplayPromo({
  themeMode = 'dark',
  startFrameOffset = 0,
}: {
  themeMode?: 'light' | 'dark';
  startFrameOffset?: number;
}) {
  const videoTheme = getVideoTheme(themeMode);
  const rawFrame = useCurrentFrame();
  const frame = (rawFrame + startFrameOffset) % 330;
  const { fps } = useVideoConfig();

  const windowSpring = spring({ frame: Math.max(0, frame - 10), fps, config: { damping: 16, stiffness: 120 } });
  const fadeOut = interpolate(frame, [315, 329], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Replay timeline: reveal candles from frame 35 to 220
  const activeCandleIndex = Math.min(
    REPLAY_CANDLES.length - 1,
    Math.max(
      0,
      Math.floor(
        interpolate(frame, [35, 220], [0, REPLAY_CANDLES.length - 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      )
    )
  );

  const currentCandle = REPLAY_CANDLES[activeCandleIndex];
  const pnlValue = currentCandle.pnl;
  const pnlColor = pnlValue !== null && pnlValue < 0 ? videoTheme.loss : '#20B86A';

  const progressPercent = Math.min(
    100,
    Math.max(
      0,
      interpolate(frame, [35, 220], [0, 100], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    )
  );

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 15%, ${videoTheme.accent}35, transparent 65%), ${videoTheme.background}`,
        fontFamily: 'Inter, SF Pro Display, Helvetica, Arial, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Brand Header: 170px Owl SVG Logo + "Trade Replay" Title (78px) */}
      <BrandHeader themeMode={themeMode} title="Trade Replay" logoSize={170} />

      {/* Main Clean Card Container (NO window header bar) */}
      <div
        style={{
          position: 'absolute',
          left: 44,
          right: 44,
          top: 220,
          bottom: 40,
          borderRadius: 44,
          background: videoTheme.card,
          border: `3px solid ${videoTheme.border}`,
          boxShadow: '0 40px 100px rgba(0,0,0,.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 36,
          opacity: windowSpring,
          transform: `scale(${interpolate(windowSpring, [0, 1], [0.95, 1])})`,
        }}
      >
        {/* P&L and Time Header (NO "UNREALIZED P&L" or "BAR TIME" text) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            height: 90,
            padding: '0 10px',
          }}
        >
          {/* P&L Display (Appears on 2nd Green Candle, turns RED on Pullback, Green on Rallies) */}
          <div>
            {pnlValue !== null ? (
              <div style={{ color: pnlColor, fontSize: 64, fontWeight: 900 }}>
                {pnlValue >= 0 ? `+$${pnlValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : `-$${Math.abs(pnlValue).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
              </div>
            ) : (
              <div style={{ color: videoTheme.muted, fontSize: 44, fontWeight: 800 }}>
                --
              </div>
            )}
          </div>

          {/* Time Display (Only Time, NO "BAR TIME" text) */}
          <div style={{ color: videoTheme.foreground, fontSize: 44, fontWeight: 900 }}>
            {currentCandle.time}
          </div>
        </div>

        {/* Scaled SVG Chart Area with Fat Candlesticks */}
        <div style={{ flex: 1, position: 'relative', width: '100%', marginTop: 20 }}>
          <svg viewBox="0 0 960 760" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
            {/* Horizontal Gridlines */}
            {[0.15, 0.35, 0.55, 0.75, 0.95].map((r) => (
              <line key={r} x1={20} x2={940} y1={r * 720} y2={r * 720} stroke={videoTheme.grid} strokeDasharray="10 14" strokeWidth={3} />
            ))}

            {/* Candlesticks */}
            {REPLAY_CANDLES.slice(0, activeCandleIndex + 1).map((candle, idx) => {
              const x = 110 + idx * 144;
              const minP = 148.0;
              const maxP = 167.0;
              const y = (p: number) => 700 - ((p - minP) / (maxP - minP)) * 640;
              const bullish = candle.close >= candle.open;
              const color = bullish ? videoTheme.profit : videoTheme.loss;
              const openY = y(candle.open);
              const closeY = y(candle.close);
              const topY = Math.min(openY, closeY);
              const bodyHeight = Math.max(20, Math.abs(closeY - openY));

              return (
                <g key={idx}>
                  {/* Thick Wick */}
                  <line x1={x} x2={x} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth={10} strokeLinecap="round" />
                  {/* Fat Body */}
                  <rect x={x - 44} y={topY} width={88} height={bodyHeight} rx={16} fill={color} />

                  {/* BUY Green Up Arrow ▲ (No text badge) */}
                  {candle.action === 'BUY' && (
                    <g transform={`translate(${x - 24}, ${y(candle.low) + 30})`}>
                      <path
                        d="M 24 0 L 48 38 L 0 38 Z"
                        fill="#20B86A"
                        style={{ filter: 'drop-shadow(0 4px 12px rgba(32, 184, 106, 0.6))' }}
                      />
                    </g>
                  )}

                  {/* SELL Red Down Arrow ▼ (No text badge) */}
                  {candle.action === 'SELL' && (
                    <g transform={`translate(${x - 24}, ${y(candle.high) - 68})`}>
                      <path
                        d="M 0 0 L 48 0 L 24 38 Z"
                        fill="#EF4444"
                        style={{ filter: 'drop-shadow(0 4px 12px rgba(239, 68, 68, 0.6))' }}
                      />
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Bottom Control Bar */}
        <div
          style={{
            height: 80,
            background: videoTheme.cardRaised,
            borderRadius: 24,
            padding: '0 32px',
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            flexShrink: 0,
            marginTop: 10,
          }}
        >
          <div style={{ color: videoTheme.accentBright, fontSize: 24, fontWeight: 900 }}>
            ❚❚ 1x Speed
          </div>

          <div style={{ flex: 1, height: 16, borderRadius: 8, background: videoTheme.border, overflow: 'hidden' }}>
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                background: '#20B86A',
                borderRadius: 8,
              }}
            />
          </div>

          <div style={{ color: videoTheme.muted, fontSize: 22, fontWeight: 800 }}>
            {activeCandleIndex + 1} / {REPLAY_CANDLES.length} Bars
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

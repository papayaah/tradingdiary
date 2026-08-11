import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { BrandHeader } from '../components/BrandHeader';
import { getVideoTheme } from '../theme';

// Head and Shoulders Candlestick Structure
const HS_CANDLES = [
  // Intro / Base
  { open: 148.0, high: 151.0, low: 147.5, close: 150.5 },
  // Left Shoulder Peak (154.0)
  { open: 150.5, high: 154.0, low: 150.0, close: 153.5 },
  { open: 153.5, high: 153.8, low: 149.8, close: 150.2 }, // Trough 1
  // Head Peak (160.0)
  { open: 150.2, high: 156.0, low: 150.0, close: 155.5 },
  { open: 155.5, high: 160.0, low: 155.0, close: 159.2 }, // Head
  { open: 159.2, high: 159.5, low: 150.0, close: 150.5 }, // Trough 2
  // Right Shoulder Peak (155.0)
  { open: 150.5, high: 155.0, low: 150.2, close: 154.2 },
  // Bearish Breakdown Below Neckline (145.0)
  { open: 154.2, high: 154.5, low: 144.5, close: 145.0 },
];

export function AutoScanPromo({
  themeMode = 'dark',
  startFrameOffset = 247,
}: {
  themeMode?: 'light' | 'dark';
  startFrameOffset?: number;
}) {
  const videoTheme = getVideoTheme(themeMode);
  const rawFrame = useCurrentFrame();
  const frame = (rawFrame + startFrameOffset) % 330;
  const { fps } = useVideoConfig();

  const chartSpring = spring({ frame: Math.max(0, frame - 10), fps, config: { damping: 16, stiffness: 140 } });

  // Arcs start completely BLANK (0% progress & 0 opacity) at playback start!
  // 1. Left Shoulder Arc (frames 30 -> 60)
  const lsProgress = interpolate(frame, [30, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const lsOpacity = interpolate(frame, [30, 45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // 2. Head Arc (frames 55 -> 85)
  const headProgress = interpolate(frame, [55, 85], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const headOpacity = interpolate(frame, [55, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // 3. Right Shoulder Arc (frames 80 -> 110)
  const rsProgress = interpolate(frame, [80, 110], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const rsOpacity = interpolate(frame, [80, 95], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Pattern detection alert pop
  const alertSpring = spring({ frame: Math.max(0, frame - 105), fps, config: { damping: 12, stiffness: 180 } });

  const fadeOut = interpolate(frame, [315, 329], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Sleek neutral icy-blue / silver arc stroke color
  const neutralArcColor = themeMode === 'dark' ? '#38BDF8' : '#0284C7';

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 15%, ${videoTheme.accent}35, transparent 65%), ${videoTheme.background}`,
        fontFamily: 'Inter, SF Pro Display, Helvetica, Arial, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Brand Header: 170px Owl SVG Logo + "Pattern Scanner" Title (78px) */}
      <BrandHeader themeMode={themeMode} title="Pattern Scanner" logoSize={170} />

      {/* Full-Height Maximized Chart Container */}
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
          padding: 36,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          opacity: chartSpring,
          transform: `scale(${interpolate(chartSpring, [0, 1], [0.95, 1])})`,
        }}
      >
        {/* Scaled-Up SVG Candlestick Chart filling 100% vertical space */}
        <div style={{ flex: 1, position: 'relative', width: '100%', marginTop: 20 }}>
          <svg viewBox="0 0 960 1000" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
            {/* Horizontal Gridlines */}
            {[0.15, 0.35, 0.55, 0.75, 0.95].map((r) => (
              <line key={r} x1={10} x2={950} y1={r * 1000} y2={r * 1000} stroke={videoTheme.grid} strokeDasharray="10 14" strokeWidth={3} />
            ))}

            {/* 3 DISJOINTED NEUTRAL GLOWING CURVED ARCS (Floating HIGHER above high wicks) */}

            {/* 1. Left Shoulder Arc (Nudged higher above top wick) */}
            <path
              d="M 115 410 Q 200 300 285 410"
              fill="none"
              stroke={neutralArcColor}
              strokeWidth={10}
              strokeLinecap="round"
              strokeDasharray="400"
              strokeDashoffset={400 - 400 * lsProgress}
              opacity={lsOpacity}
              style={{
                filter: `drop-shadow(0 0 14px ${neutralArcColor}88)`,
              }}
            />

            {/* 2. Head Arc (Nudged higher above top wick) */}
            <path
              d="M 410 190 Q 515 70 620 190"
              fill="none"
              stroke={neutralArcColor}
              strokeWidth={10}
              strokeLinecap="round"
              strokeDasharray="500"
              strokeDashoffset={500 - 500 * headProgress}
              opacity={headOpacity}
              style={{
                filter: `drop-shadow(0 0 14px ${neutralArcColor}88)`,
              }}
            />

            {/* 3. Right Shoulder Arc (Nudged higher above top wick) */}
            <path
              d="M 640 390 Q 725 280 810 390"
              fill="none"
              stroke={neutralArcColor}
              strokeWidth={10}
              strokeLinecap="round"
              strokeDasharray="400"
              strokeDashoffset={400 - 400 * rsProgress}
              opacity={rsOpacity}
              style={{
                filter: `drop-shadow(0 0 14px ${neutralArcColor}88)`,
              }}
            />

            {/* FAT CANDLESTICKS (Width = 96px, Matching Price Action Alerts Fatness) */}
            {HS_CANDLES.map((c, i) => {
              const cx = 95 + i * 105;
              const yBase = 620;
              const priceDiff = (c.close - 150.0) * 44;
              const isGreen = c.close >= c.open;
              const color = isGreen ? videoTheme.profit : videoTheme.loss;
              const bodyHeight = Math.max(44, Math.abs(c.close - c.open) * 44);
              const animatedY = yBase - priceDiff;

              return (
                <g key={i}>
                  {/* Thick Wick */}
                  <line x1={cx} x2={cx} y1={animatedY - 40} y2={animatedY + bodyHeight + 40} stroke={color} strokeWidth={10} strokeLinecap="round" />
                  {/* Fat Body (width = 96) */}
                  <rect x={cx - 48} y={animatedY} width={96} height={bodyHeight} rx={18} fill={color} />
                </g>
              );
            })}
          </svg>

          {/* OVERSIZED RED BREAKDOWN BADGE (60px Font, Pure White Text, 2-Line Format) */}
          {frame >= 105 && (
            <div
              style={{
                position: 'absolute',
                top: 40,
                right: 40,
                background: videoTheme.loss,
                color: '#FFFFFF',
                padding: '34px 68px',
                borderRadius: 40,
                fontWeight: 900,
                boxShadow: '0 28px 90px rgba(239, 68, 68, 0.55)',
                transform: `scale(${alertSpring})`,
                zIndex: 30,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 60, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.15 }}>
                Head & Shoulders
                <br />
                Breakdown
              </div>
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
}

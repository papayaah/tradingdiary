import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { BrandHeader } from '../components/BrandHeader';
import { getVideoTheme } from '../theme';

// Head and Shoulders Candlestick Structure
const HS_CANDLES = [
  // Intro / Base
  { open: 148.0, high: 151.0, low: 147.5, close: 150.5 },
  // Left Shoulder Peak (154.0)
  { open: 150.5, high: 154.0, low: 150.0, close: 153.5, label: 'LEFT SHOULDER' },
  { open: 153.5, high: 153.8, low: 149.8, close: 150.2 }, // Trough 1 (Neckline 150.0)
  // Head Peak (160.0)
  { open: 150.2, high: 156.0, low: 150.0, close: 155.5 },
  { open: 155.5, high: 160.0, low: 155.0, close: 159.2, label: 'HEAD' },
  { open: 159.2, high: 159.5, low: 150.0, close: 150.5 }, // Trough 2 (Neckline 150.0)
  // Right Shoulder Peak (155.0)
  { open: 150.5, high: 155.0, low: 150.2, close: 154.2, label: 'RIGHT SHOULDER' },
  // Bearish Breakdown Below Neckline (145.0)
  { open: 154.2, high: 154.5, low: 144.5, close: 145.0, label: 'BREAKDOWN' },
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

  const chartSpring = spring({ frame: Math.max(0, frame - 10), fps, config: { damping: 16, stiffness: 120 } });

  // Neckline drawing animation
  const necklineProgress = interpolate(frame, [35, 95], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Pattern detection alert pop
  const alertScale = spring({ frame: Math.max(0, frame - 105), fps, config: { damping: 12, stiffness: 180 } });

  const fadeOut = interpolate(frame, [315, 329], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 15%, ${videoTheme.accent}35, transparent 65%), ${videoTheme.background}`,
        fontFamily: 'Inter, SF Pro Display, Helvetica, Arial, sans-serif',
        opacity: fadeOut,
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
          padding: '36px',
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
            {/* Gridlines */}
            {[0.15, 0.35, 0.55, 0.75, 0.95].map((r) => (
              <line key={r} x1={10} x2={950} y1={r * 1000} y2={r * 1000} stroke={videoTheme.grid} strokeDasharray="10 14" strokeWidth={3} />
            ))}

            {/* Neckline Dotted Path */}
            <line
              x1={60}
              x2={60 + 860 * necklineProgress}
              y1={620}
              y2={620}
              stroke={videoTheme.loss}
              strokeWidth={8}
              strokeDasharray="16 12"
            />
            {necklineProgress > 0.4 && (
              <text x={580} y={600} fill={videoTheme.loss} fontSize={26} fontWeight="900">
                NECKLINE BREAKDOWN ($150.00)
              </text>
            )}

            {/* Tall Scaled-Up Candlesticks */}
            {HS_CANDLES.map((c, i) => {
              const cx = 95 + i * 110;
              const yBase = 620;
              const priceDiff = (c.close - 150.0) * 44;
              const isGreen = c.close >= c.open;
              const color = isGreen ? videoTheme.profit : videoTheme.loss;
              const bodyHeight = Math.max(36, Math.abs(c.close - c.open) * 44);
              const animatedY = yBase - priceDiff;

              return (
                <g key={i}>
                  {/* Wick */}
                  <line x1={cx} x2={cx} y1={animatedY - 40} y2={animatedY + bodyHeight + 40} stroke={color} strokeWidth={8} />
                  {/* Body */}
                  <rect x={cx - 30} y={animatedY} width={60} height={bodyHeight} rx={12} fill={color} />

                  {/* Peak Labels */}
                  {c.label && frame >= 45 && (
                    <g transform={`translate(${cx}, ${animatedY - 55})`}>
                      <rect x={-85} y={-38} width={170} height={48} rx={14} fill={videoTheme.cardRaised} stroke={videoTheme.border} strokeWidth={3} />
                      <text x={0} y={-7} textAnchor="middle" fill={videoTheme.foreground} fontSize={20} fontWeight="900">
                        {c.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {/* OVERSIZED SIGNAL BADGE */}
          {frame >= 105 && (
            <div
              style={{
                position: 'absolute',
                top: 40,
                right: 40,
                background: videoTheme.loss,
                color: '#FFFFFF',
                padding: '28px 52px',
                borderRadius: 32,
                fontWeight: 900,
                boxShadow: '0 24px 80px rgba(239,68,68,0.65)',
                transform: `scale(${alertScale})`,
                zIndex: 30,
              }}
            >
              <span style={{ fontSize: 46, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1 }}>
                Head & Shoulders Breakdown
              </span>
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
}

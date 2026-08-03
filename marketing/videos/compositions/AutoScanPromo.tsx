import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { BrandHeader } from '../components/BrandHeader';
import { getVideoTheme } from '../theme';

// Head and Shoulders Candlestick Structure
const HS_CANDLES = [
  // Intro / Base
  { open: 148.0, high: 151.0, low: 147.5, close: 150.5 },
  // Left Shoulder Peak (154.0)
  { open: 150.5, high: 154.0, low: 150.0, close: 153.5, label: 'L. SHOULDER' },
  { open: 153.5, high: 153.8, low: 149.8, close: 150.2 }, // Trough 1 (Neckline 150.0)
  // Head Peak (160.0)
  { open: 150.2, high: 156.0, low: 150.0, close: 155.5 },
  { open: 155.5, high: 160.0, low: 155.0, close: 159.2, label: 'HEAD' },
  { open: 159.2, high: 159.5, low: 150.0, close: 150.5 }, // Trough 2 (Neckline 150.0)
  // Right Shoulder Peak (155.0)
  { open: 150.5, high: 155.0, low: 150.2, close: 154.2, label: 'R. SHOULDER' },
  // Bearish Breakdown Below Neckline (145.0)
  { open: 154.2, high: 154.5, low: 144.5, close: 145.0, label: 'BREAKDOWN' },
];

export function AutoScanPromo({ themeMode = 'dark' }: { themeMode?: 'light' | 'dark' }) {
  const videoTheme = getVideoTheme(themeMode);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerSpring = spring({ frame, fps, config: { damping: 18, stiffness: 130 } });
  const chartSpring = spring({ frame: frame - 12, fps, config: { damping: 16, stiffness: 120 } });

  // Neckline drawing animation
  const necklineProgress = interpolate(frame, [35, 95], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Pattern detection alert pop
  const alertOpacity = interpolate(frame, [105, 125], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const alertScale = spring({ frame: frame - 105, fps, config: { damping: 12, stiffness: 180 } });

  const fadeOut = interpolate(frame, [315, 329], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 20%, ${videoTheme.accent}30, transparent 60%), ${videoTheme.background}`,
        fontFamily: 'Inter, SF Pro Display, Helvetica, Arial, sans-serif',
        opacity: fadeOut,
        overflow: 'hidden',
      }}
    >
      <BrandHeader themeMode={themeMode} />

      {/* Header Copy */}
      <div
        style={{
          position: 'absolute',
          top: 145,
          left: 48,
          right: 48,
          textAlign: 'center',
          opacity: headerSpring,
          transform: `translateY(${interpolate(headerSpring, [0, 1], [30, 0])}px)`,
        }}
      >
        <div style={{ color: videoTheme.accentBright, fontSize: 30, fontWeight: 900, letterSpacing: 4 }}>
          AUTO PATTERN DETECTOR
        </div>
        <div style={{ color: videoTheme.foreground, fontSize: 58, fontWeight: 900, marginTop: 4, lineHeight: 1.1 }}>
          Head & Shoulders Breakdown
        </div>
      </div>

      {/* Full-Height Maximized Chart Container */}
      <div
        style={{
          position: 'absolute',
          left: 48,
          right: 48,
          top: 290,
          bottom: 90,
          borderRadius: 44,
          background: videoTheme.card,
          border: `3px solid ${videoTheme.border}`,
          boxShadow: '0 40px 100px rgba(0,0,0,.55)',
          overflow: 'hidden',
          padding: '36px 36px 24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          opacity: chartSpring,
          transform: `scale(${interpolate(chartSpring, [0, 1], [0.94, 1])})`,
        }}
      >
        {/* Chart Top Status Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 36, fontWeight: 900, color: videoTheme.foreground }}>NVDA — 5m Reversal</div>
            <div style={{ fontSize: 20, color: videoTheme.loss, fontWeight: 800, marginTop: 2 }}>
              ● AUTO SCANNED: Head & Shoulders Pattern
            </div>
          </div>

          <div
            style={{
              background: `${videoTheme.loss}22`,
              border: `2px solid ${videoTheme.loss}66`,
              color: videoTheme.loss,
              padding: '10px 22px',
              borderRadius: 18,
              fontSize: 20,
              fontWeight: 900,
            }}
          >
            98% CONFIDENCE
          </div>
        </div>

        {/* Scaled-Up SVG Candlestick Chart filling 100% vertical space */}
        <div style={{ flex: 1, position: 'relative', width: '100%' }}>
          <svg viewBox="0 0 960 1100" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
            {/* Gridlines */}
            {[0.15, 0.35, 0.55, 0.75, 0.95].map((r) => (
              <line key={r} x1={10} x2={950} y1={r * 1100} y2={r * 1100} stroke={videoTheme.grid} strokeDasharray="10 12" strokeWidth={3} />
            ))}

            {/* Neckline Dotted Path (y = 650 -> $150.00 level) */}
            <line
              x1={60}
              x2={60 + 860 * necklineProgress}
              y1={650}
              y2={650}
              stroke={videoTheme.loss}
              strokeWidth={8}
              strokeDasharray="16 12"
            />
            {necklineProgress > 0.4 && (
              <text x={580} y={635} fill={videoTheme.loss} fontSize={26} fontWeight="900">
                NECKLINE BREAKDOWN ($150.00)
              </text>
            )}

            {/* Tall Scaled-Up Candlesticks */}
            {HS_CANDLES.map((c, i) => {
              const cx = 95 + i * 110;
              // Stretch vertical price scaling: price 160 -> y=180, price 150 -> y=650, price 145 -> y=880
              const cy = 650 - (c.close - 150.0) * 47;
              const isGreen = c.close >= c.open;
              const color = isGreen ? videoTheme.profit : videoTheme.loss;
              const bodyHeight = Math.max(36, Math.abs(c.close - c.open) * 47);

              return (
                <g key={i}>
                  {/* Wick */}
                  <line x1={cx} x2={cx} y1={cy - 40} y2={cy + bodyHeight + 40} stroke={color} strokeWidth={8} />
                  {/* Body */}
                  <rect x={cx - 30} y={cy} width={60} height={bodyHeight} rx={12} fill={color} />

                  {/* Peak Labels (Left Shoulder, Head, Right Shoulder) */}
                  {c.label && frame >= 45 && (
                    <g transform={`translate(${cx}, ${cy - 55})`}>
                      <rect x={-75} y={-36} width={150} height={46} rx={14} fill={videoTheme.cardRaised} stroke={videoTheme.border} strokeWidth={3} />
                      <text x={0} y={-7} textAnchor="middle" fill={videoTheme.foreground} fontSize={18} fontWeight="900">
                        {c.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Pattern Detected Alert Badge */}
          {frame >= 105 && (
            <div
              style={{
                position: 'absolute',
                top: 40,
                right: 30,
                background: videoTheme.loss,
                color: '#FFFFFF',
                padding: '22px 36px',
                borderRadius: 28,
                fontWeight: 900,
                boxShadow: '0 24px 70px rgba(239,68,68,0.55)',
                transform: `scale(${alertScale})`,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                zIndex: 30,
              }}
            >
              <span style={{ fontSize: 16, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.9 }}>
                🔥 PATTERN DETECTED
              </span>
              <span style={{ fontSize: 34, lineHeight: 1.1 }}>Head & Shoulders Breakdown</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Branding Footer */}
      <div
        style={{
          position: 'absolute',
          bottom: 30,
          width: '100%',
          textAlign: 'center',
          color: videoTheme.muted,
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: 2,
        }}
      >
        TRADING DIARY — AUTO PATTERN DETECTOR
      </div>
    </AbsoluteFill>
  );
}

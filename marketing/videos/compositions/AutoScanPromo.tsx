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
  { open: 154.2, high: 154.5, low: 145.0, close: 145.5, label: 'BREAKDOWN' },
];

export function AutoScanPromo({ themeMode = 'dark' }: { themeMode?: 'light' | 'dark' }) {
  const videoTheme = getVideoTheme(themeMode);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerSpring = spring({ frame, fps, config: { damping: 18, stiffness: 130 } });
  const chartSpring = spring({ frame: frame - 12, fps, config: { damping: 16, stiffness: 120 } });
  
  // Neckline drawing animation
  const necklineProgress = interpolate(frame, [40, 100], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Pattern detection alert pop
  const alertOpacity = interpolate(frame, [110, 130], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const alertScale = spring({ frame: frame - 110, fps, config: { damping: 12, stiffness: 180 } });

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

      {/* Title Header */}
      <div
        style={{
          position: 'absolute',
          top: 150,
          left: 48,
          right: 48,
          textAlign: 'center',
          opacity: headerSpring,
          transform: `translateY(${interpolate(headerSpring, [0, 1], [30, 0])}px)`,
        }}
      >
        <div style={{ color: videoTheme.accentBright, fontSize: 32, fontWeight: 900, letterSpacing: 4 }}>
          AUTO PATTERN SCANNER
        </div>
        <div style={{ color: videoTheme.foreground, fontSize: 62, fontWeight: 900, marginTop: 6, lineHeight: 1.1 }}>
          Head & Shoulders Detection
        </div>
        <div style={{ color: videoTheme.muted, fontSize: 26, marginTop: 12 }}>
          Automated multi-peak reversal recognition with instant neckline breakdown alerts.
        </div>
      </div>

      {/* Full-Bleed Chart Container (Zero Sidebar Clutter) */}
      <div
        style={{
          position: 'absolute',
          left: 48,
          right: 48,
          top: 360,
          bottom: 120,
          borderRadius: 44,
          background: videoTheme.card,
          border: `3px solid ${videoTheme.border}`,
          boxShadow: '0 40px 100px rgba(0,0,0,.55)',
          overflow: 'hidden',
          padding: 40,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          opacity: chartSpring,
          transform: `scale(${interpolate(chartSpring, [0, 1], [0.94, 1])})`,
        }}
      >
        {/* Chart Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 38, fontWeight: 900, color: videoTheme.foreground }}>NVDA — 5m Reversal Setup</div>
            <div style={{ fontSize: 20, color: videoTheme.loss, fontWeight: 800, marginTop: 4 }}>
              ● AUTO DETECTOR: Bearish Head & Shoulders Pattern Active
            </div>
          </div>

          <div
            style={{
              background: `${videoTheme.loss}22`,
              border: `2px solid ${videoTheme.loss}55`,
              color: videoTheme.loss,
              padding: '10px 24px',
              borderRadius: 18,
              fontSize: 20,
              fontWeight: 850,
            }}
          >
            CONFIDENCE: 98%
          </div>
        </div>

        {/* SVG Candlestick Chart with Head & Shoulders Overlays */}
        <div style={{ position: 'relative', height: 440, width: '100%' }}>
          <svg viewBox="0 0 960 440" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
            {/* Horizontal Gridlines */}
            {[0.2, 0.4, 0.6, 0.8].map((r) => (
              <line key={r} x1={20} x2={940} y1={r * 400} y2={r * 400} stroke={videoTheme.grid} strokeDasharray="8 12" strokeWidth={2} />
            ))}

            {/* Neckline Dotted Path (y = 260 -> $150.00 level) */}
            <line
              x1={80}
              x2={80 + 840 * necklineProgress}
              y1={260}
              y2={260}
              stroke={videoTheme.loss}
              strokeWidth={5}
              strokeDasharray="10 8"
            />
            {necklineProgress > 0.5 && (
              <text x={870} y={254} fill={videoTheme.loss} fontSize={18} fontWeight="900">
                NECKLINE ($150.00)
              </text>
            )}

            {/* Candlesticks & Peak Labels */}
            {HS_CANDLES.map((c, i) => {
              const cx = 100 + i * 105;
              const cy = 340 - (c.close - 142) * 18;
              const isGreen = c.close >= c.open;
              const color = isGreen ? videoTheme.profit : videoTheme.loss;
              const height = Math.max(18, Math.abs(c.close - c.open) * 18);

              return (
                <g key={i}>
                  {/* Wick */}
                  <line x1={cx} x2={cx} y1={cy - 15} y2={cy + height + 15} stroke={color} strokeWidth={4} />
                  {/* Body */}
                  <rect x={cx - 22} y={cy} width={44} height={height} rx={8} fill={color} />

                  {/* Peak Labels (Left Shoulder, Head, Right Shoulder) */}
                  {c.label && frame >= 60 && (
                    <g transform={`translate(${cx}, ${cy - 30})`}>
                      <rect x={-55} y={-24} width={110} height={30} rx={10} fill={videoTheme.cardRaised} stroke={videoTheme.border} strokeWidth={2} />
                      <text x={0} y={-4} textAnchor="middle" fill={videoTheme.foreground} fontSize={13} fontWeight="900">
                        {c.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Pattern Detected Alert Badge */}
          {frame >= 110 && (
            <div
              style={{
                position: 'absolute',
                top: 40,
                right: 40,
                background: videoTheme.loss,
                color: '#FFFFFF',
                padding: '18px 32px',
                borderRadius: 24,
                fontWeight: 900,
                boxShadow: '0 20px 60px rgba(239,68,68,0.5)',
                transform: `scale(${alertScale})`,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                zIndex: 30,
              }}
            >
              <span style={{ fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.9 }}>
                🔥 PATTERN DETECTED
              </span>
              <span style={{ fontSize: 30, lineHeight: 1.1 }}>Head & Shoulders Breakdown</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Branding Footer */}
      <div
        style={{
          position: 'absolute',
          bottom: 36,
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

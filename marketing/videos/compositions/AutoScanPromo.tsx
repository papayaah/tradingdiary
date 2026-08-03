import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { BrandHeader } from '../components/BrandHeader';
import { getVideoTheme } from '../theme';

const WATCHLIST = [
  { symbol: 'NVDA', price: '$134.80', change: '+3.4%', pattern: 'Bullish Engulfing', match: true },
  { symbol: 'AAPL', price: '$224.20', change: '+1.2%', pattern: 'Consecutive Move', match: true },
  { symbol: 'TSLA', price: '$248.50', change: '-0.8%', pattern: 'None', match: false },
  { symbol: 'AMD', price: '$156.30', change: '+2.1%', pattern: 'Range Breakout', match: true },
];

const NVDA_CANDLES = [
  { open: 128.0, high: 129.5, low: 127.5, close: 128.8 },
  { open: 128.8, high: 130.2, low: 128.2, close: 129.5 },
  { open: 129.5, high: 129.8, low: 127.0, close: 127.2 }, // Red candle
  { open: 126.9, high: 134.8, low: 126.5, close: 134.2 }, // Huge Bullish Engulfing
];

export function AutoScanPromo({ themeMode = 'dark' }: { themeMode?: 'light' | 'dark' }) {
  const videoTheme = getVideoTheme(themeMode);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerSpring = spring({ frame, fps, config: { damping: 18, stiffness: 130 } });
  const cardSpring = spring({ frame: frame - 12, fps, config: { damping: 16, stiffness: 120 } });
  const scanSweep = interpolate(frame, [40, 180], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const matchOpacity = interpolate(frame, [110, 130], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const matchScale = spring({ frame: frame - 110, fps, config: { damping: 12, stiffness: 180 } });

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
          AUTO PATTERN DETECTOR
        </div>
        <div style={{ color: videoTheme.foreground, fontSize: 62, fontWeight: 900, marginTop: 6, lineHeight: 1.1 }}>
          Whatever In View, Revealed.
        </div>
        <div style={{ color: videoTheme.muted, fontSize: 26, marginTop: 12 }}>
          Instant algorithmic pattern matching for any symbol in your watchlist.
        </div>
      </div>

      {/* Main Interface Window */}
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
          display: 'flex',
          opacity: cardSpring,
          transform: `scale(${interpolate(cardSpring, [0, 1], [0.94, 1])})`,
        }}
      >
        {/* Watchlist Sidebar */}
        <div
          style={{
            width: 340,
            borderRight: `3px solid ${videoTheme.border}`,
            background: videoTheme.cardRaised,
            padding: '32px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ color: videoTheme.muted, fontSize: 18, fontWeight: 850, letterSpacing: 1.5, marginBottom: 8 }}>
            WATCHLIST SYMBOLS
          </div>
          {WATCHLIST.map((item, idx) => {
            const isSelected = idx === 0;
            return (
              <div
                key={item.symbol}
                style={{
                  padding: '16px 20px',
                  borderRadius: 20,
                  background: isSelected ? `${videoTheme.accent}22` : videoTheme.card,
                  border: `2px solid ${isSelected ? videoTheme.accent : videoTheme.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: videoTheme.foreground }}>{item.symbol}</div>
                  <div style={{ fontSize: 16, color: videoTheme.muted, marginTop: 2 }}>{item.price}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 850, color: item.change.startsWith('+') ? videoTheme.profit : videoTheme.loss }}>
                    {item.change}
                  </div>
                  {item.match && (
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: 12,
                        fontWeight: 900,
                        color: videoTheme.profit,
                        background: `${videoTheme.profit}22`,
                        padding: '3px 8px',
                        borderRadius: 8,
                        marginTop: 4,
                      }}
                    >
                      MATCH
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Chart & Live Scanner Area */}
        <div style={{ flex: 1, padding: 36, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}>
          {/* Header Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 36, fontWeight: 900, color: videoTheme.foreground }}>NVDA — 5m Chart</div>
              <div style={{ fontSize: 20, color: videoTheme.profit, fontWeight: 800, marginTop: 4 }}>
                ● Auto Scanner Scanning In View...
              </div>
            </div>

            {/* Radar Scan Bar */}
            <div
              style={{
                width: 220,
                height: 14,
                borderRadius: 7,
                background: videoTheme.cardRaised,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: `${scanSweep}%`,
                  height: '100%',
                  background: videoTheme.accentBright,
                  borderRadius: 7,
                }}
              />
            </div>
          </div>

          {/* SVG Candlestick Chart with Auto Pattern Highlight */}
          <div style={{ position: 'relative', height: 420, width: '100%' }}>
            <svg viewBox="0 0 700 360" style={{ width: '100%', height: '100%' }}>
              {/* Gridlines */}
              {[0.2, 0.4, 0.6, 0.8].map((r) => (
                <line key={r} x1={20} x2={680} y1={r * 340} y2={r * 340} stroke={videoTheme.grid} strokeDasharray="6 8" strokeWidth={2} />
              ))}

              {/* Candlesticks */}
              {NVDA_CANDLES.map((c, i) => {
                const cx = 120 + i * 150;
                const cy = 260 - (c.close - 126) * 28;
                const isGreen = c.close >= c.open;
                const color = isGreen ? videoTheme.profit : videoTheme.loss;
                const height = Math.max(16, Math.abs(c.close - c.open) * 28);
                return (
                  <g key={i}>
                    <line x1={cx} x2={cx} y1={cy - 20} y2={cy + height + 20} stroke={color} strokeWidth={4} />
                    <rect x={cx - 24} y={cy} width={48} height={height} rx={8} fill={color} />
                  </g>
                );
              })}

              {/* Pattern Match Glowing Box on Candle 3 & 4 */}
              {frame >= 100 && (
                <rect
                  x={390}
                  y={40}
                  width={210}
                  height={290}
                  rx={20}
                  fill="none"
                  stroke={videoTheme.profit}
                  strokeWidth={4}
                  strokeDasharray="10 6"
                  style={{
                    opacity: matchOpacity,
                  }}
                />
              )}
            </svg>

            {/* Pattern Detected Popup Badge */}
            {frame >= 110 && (
              <div
                style={{
                  position: 'absolute',
                  top: 50,
                  right: 40,
                  background: videoTheme.profit,
                  color: '#000000',
                  padding: '16px 28px',
                  borderRadius: 24,
                  fontWeight: 900,
                  boxShadow: '0 20px 50px rgba(52,231,160,0.5)',
                  transform: `scale(${matchScale})`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.85 }}>
                  ✓ AUTO PATTERN DETECTED
                </span>
                <span style={{ fontSize: 28, lineHeight: 1 }}>Bullish Engulfing (96%)</span>
              </div>
            )}
          </div>
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
        TRADING DIARY — AUTO PATTERN SCANNER
      </div>
    </AbsoluteFill>
  );
}

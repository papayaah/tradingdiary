import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { BrandHeader } from '../components/BrandHeader';
import { ComicBadge, ComicStarburst } from '../components/ComicBurst';
import { getVideoTheme } from '../theme';

const REPLAY_CANDLES = [
  { open: 150.0, high: 152.5, low: 149.2, close: 152.0, time: '09:30 AM' },
  { open: 152.0, high: 154.1, low: 151.8, close: 153.8, time: '09:35 AM' },
  { open: 153.8, high: 153.9, low: 151.2, close: 151.5, time: '09:40 AM' },
  { open: 151.5, high: 155.0, low: 151.5, close: 154.6, time: '09:45 AM', action: 'BUY', price: 152.1 },
  { open: 154.6, high: 157.8, low: 154.0, close: 157.2, time: '09:50 AM' },
  { open: 157.2, high: 160.4, low: 156.9, close: 159.9, time: '09:55 AM' },
  { open: 159.9, high: 163.5, low: 159.5, close: 163.0, time: '10:00 AM' },
  { open: 163.0, high: 165.2, low: 162.8, close: 164.8, time: '10:05 AM', action: 'SELL', price: 164.5 },
];

export function ProductMashupPromo({ themeMode = 'dark' }: { themeMode?: 'light' | 'dark' }) {
  const videoTheme = getVideoTheme(themeMode);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Scene timing transitions (Total 900 frames = 30 sec @ 30fps)
  // Scene 1 Intro: 0 - 90
  // Scene 2 Import: 90 - 270
  // Scene 3 Analytics: 270 - 450
  // Scene 4 Replay: 450 - 630
  // Scene 5 Watch: 630 - 810
  // Scene 6 Outro: 810 - 900

  const sceneIndex = Math.floor(frame / 180);

  // Background Flash on Scene Cut
  const flashOpacity = interpolate((frame % 180), [0, 4, 12], [0.8, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Scene 2 Import animation
  const importFileDrop = spring({ frame: frame - 110, fps, config: { damping: 14 } });

  // Scene 3 Analytics values
  const analyticsProgress = interpolate(frame, [290, 430], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const pnlVal = Math.round(interpolate(analyticsProgress, [0, 1], [0, 18450]));
  const winRate = interpolate(analyticsProgress, [0, 1], [0, 68.5]);

  // Scene 4 Replay candle progress
  const activeCandleIndex = Math.min(
    REPLAY_CANDLES.length - 1,
    Math.max(0, Math.floor(interpolate(frame, [470, 610], [0, REPLAY_CANDLES.length - 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })))
  );

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 30%, ${videoTheme.accent}33, transparent 65%), ${videoTheme.background}`,
        fontFamily: 'Inter, SF Pro Display, Helvetica, Arial, sans-serif',
        overflow: 'hidden',
        color: videoTheme.foreground,
      }}
    >
      <BrandHeader themeMode={themeMode} />

      {/* Screen Cut Flash Effect */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#FFFFFF',
          opacity: flashOpacity,
          zIndex: 100,
          pointerEvents: 'none',
        }}
      />

      {/* ========================================================
          SCENE 1: COMIC INTRO HOOK (0 - 90 frames / 0s - 3s)
          ======================================================== */}
      {frame >= 0 && frame < 95 && (
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <ComicStarburst delay={5} size={480} top="40%" left="50%" color="#FFCC00" />
          <ComicBadge text="BOOM!" subtext="Ditch spreadsheet chaos" delay={10} top="22%" left="34%" rotate={-8} bgColor="#FF3B30" scale={1.2} />
          
          <div
            style={{
              textAlign: 'center',
              transform: `scale(${spring({ frame, fps, config: { damping: 12 } })})`,
            }}
          >
            <div style={{ color: videoTheme.accentBright, fontSize: 36, fontWeight: 900, letterSpacing: 4 }}>
              TRADING DIARY
            </div>
            <div style={{ fontSize: 72, fontWeight: 900, marginTop: 10, textShadow: '0 0 40px rgba(129,140,248,0.5)' }}>
              Master Your Execution Edge.
            </div>
            <div style={{ color: videoTheme.muted, fontSize: 28, marginTop: 14 }}>
              Automated Analytics • 1-Click Import • Bar-by-Bar Replay
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* ========================================================
          SCENE 2: FAST MULTI-BROKER IMPORT (90 - 270 frames / 3s - 9s)
          ======================================================== */}
      {frame >= 85 && frame < 275 && (
        <AbsoluteFill style={{ padding: '140px 120px 80px', display: 'flex', flexDirection: 'column' }}>
          <ComicBadge text="ZAP!" subtext="1-Click Broker Import" delay={95} top="140px" right="140px" rotate={12} bgColor="#FF9500" />
          <ComicBadge text="KA-CHING!" subtext="Zero Spreadsheets" delay={180} bottom="140px" left="140px" rotate={-6} bgColor="#34E7A0" color="#000" />

          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <span style={{ color: videoTheme.accentBright, fontSize: 24, fontWeight: 900, letterSpacing: 3 }}>
              FEATURE #1 — BROKER STATEMENT IMPORT
            </span>
            <h2 style={{ fontSize: 48, fontWeight: 900, marginTop: 4 }}>
              Drop Statements. Get Instant Dashboard Insights.
            </h2>
          </div>

          <div
            style={{
              flex: 1,
              borderRadius: 36,
              background: videoTheme.card,
              border: `3px solid ${videoTheme.border}`,
              boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* File Drop Indicator */}
            <div
              style={{
                width: 480,
                height: 240,
                borderRadius: 24,
                border: `3px dashed ${videoTheme.accent}`,
                background: `${videoTheme.accent}15`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `translateY(${interpolate(importFileDrop, [0, 1], [-200, 0])}px)`,
                opacity: importFileDrop,
              }}
            >
              <div style={{ fontSize: 44, marginBottom: 8 }}>📄 IBKR_Statement.csv</div>
              <div style={{ color: videoTheme.profit, fontSize: 22, fontWeight: 850 }}>
                ✓ FORMATTED & PARSED INSTANTLY
              </div>
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* ========================================================
          SCENE 3: VISUAL ANALYTICS (270 - 450 frames / 9s - 15s)
          ======================================================== */}
      {frame >= 265 && frame < 455 && (
        <AbsoluteFill style={{ padding: '140px 120px 80px', display: 'flex', flexDirection: 'column' }}>
          <ComicBadge text="BAM!" subtext="Real-Time Performance" delay={275} top="140px" left="140px" rotate={-10} bgColor="#007AFF" />
          <ComicBadge text="68.5% WIN RATE!" delay={340} bottom="140px" right="140px" rotate={8} bgColor="#34E7A0" color="#000" />

          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            <span style={{ color: videoTheme.accentBright, fontSize: 24, fontWeight: 900, letterSpacing: 3 }}>
              FEATURE #2 — VISUAL PERFORMANCE ANALYTICS
            </span>
            <h2 style={{ fontSize: 48, fontWeight: 900, marginTop: 4 }}>
              Track Cumulative Equity & Hold Time Edge
            </h2>
          </div>

          <div style={{ flex: 1, display: 'flex', gap: 36 }}>
            {/* Equity Curve Panel */}
            <div
              style={{
                flex: 1.4,
                borderRadius: 36,
                background: videoTheme.card,
                border: `3px solid ${videoTheme.border}`,
                padding: 32,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ color: videoTheme.muted, fontSize: 18, fontWeight: 800 }}>CUMULATIVE P&L</div>
                <div style={{ color: videoTheme.profit, fontSize: 52, fontWeight: 900, marginTop: 2 }}>
                  +${pnlVal.toLocaleString('en-US')}
                </div>
              </div>
              <svg viewBox="0 0 600 240" style={{ width: '100%', height: 240 }}>
                <path
                  d={`M 20 220 L 100 190 L 180 205 L 260 140 L 340 110 L 420 130 L 500 70 L 580 30`}
                  fill="none"
                  stroke={videoTheme.profit}
                  strokeWidth={8}
                  strokeDasharray="800"
                  strokeDashoffset={800 - 800 * analyticsProgress}
                  strokeLinecap="round"
                />
              </svg>
            </div>

            {/* Donut & Hold Time Panel */}
            <div
              style={{
                flex: 1,
                borderRadius: 36,
                background: videoTheme.card,
                border: `3px solid ${videoTheme.border}`,
                padding: 32,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: 24,
              }}
            >
              <div style={{ color: videoTheme.muted, fontSize: 18, fontWeight: 800 }}>WIN RATE RING</div>
              <div style={{ fontSize: 44, fontWeight: 900, color: videoTheme.profit }}>
                {winRate.toFixed(1)}% <span style={{ fontSize: 20, color: videoTheme.foreground }}>(48W / 22L)</span>
              </div>

              <div style={{ borderTop: `2px solid ${videoTheme.border}`, paddingTop: 16 }}>
                <div style={{ color: videoTheme.muted, fontSize: 16, fontWeight: 800 }}>PROFIT FACTOR</div>
                <div style={{ color: videoTheme.accentBright, fontSize: 36, fontWeight: 900 }}>2.64</div>
              </div>
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* ========================================================
          SCENE 4: BAR-BY-BAR REPLAY (450 - 630 frames / 15s - 21s)
          ======================================================== */}
      {frame >= 445 && frame < 635 && (
        <AbsoluteFill style={{ padding: '140px 120px 80px', display: 'flex', flexDirection: 'column' }}>
          <ComicBadge text="⏪ REWIND!" subtext="Frame-By-Frame Replay" delay={455} top="140px" right="140px" rotate={10} bgColor="#AF52DE" />
          <ComicBadge text="BUY & SELL TARGETS!" delay={530} bottom="140px" left="140px" rotate={-8} bgColor="#FFCC00" color="#000" />

          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            <span style={{ color: videoTheme.accentBright, fontSize: 24, fontWeight: 900, letterSpacing: 3 }}>
              FEATURE #3 — BAR-BY-BAR TRADE REPLAY ENGINE
            </span>
            <h2 style={{ fontSize: 48, fontWeight: 900, marginTop: 4 }}>
              Relive Entries & Exits to Spot Execution Flaws
            </h2>
          </div>

          <div
            style={{
              flex: 1,
              borderRadius: 36,
              background: videoTheme.card,
              border: `3px solid ${videoTheme.border}`,
              padding: '28px 36px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 850 }}>NVDA — 5m Replay Session</div>
              <div style={{ color: videoTheme.profit, fontSize: 36, fontWeight: 900 }}>
                +$1,240.00 P&L
              </div>
            </div>

            <svg viewBox="0 0 1000 280" style={{ width: '100%', height: 280 }}>
              {REPLAY_CANDLES.slice(0, activeCandleIndex + 1).map((c, i) => {
                const cx = 100 + i * 115;
                const cy = 220 - (c.close - 148) * 12;
                const color = c.close >= c.open ? videoTheme.profit : videoTheme.loss;
                return (
                  <g key={i}>
                    <line x1={cx} x2={cx} y1={cy - 25} y2={cy + 25} stroke={color} strokeWidth={5} />
                    <rect x={cx - 18} y={cy - 15} width={36} height={30} rx={6} fill={color} />
                    {c.action === 'BUY' && (
                      <g transform={`translate(${cx - 30}, ${cy + 35})`}>
                        <rect width={60} height={28} rx={6} fill={videoTheme.profit} />
                        <text x={30} y={19} textAnchor="middle" fill="#000" fontSize={13} fontWeight="900">BUY</text>
                      </g>
                    )}
                    {c.action === 'SELL' && (
                      <g transform={`translate(${cx - 30}, ${cy - 50})`}>
                        <rect width={60} height={28} rx={6} fill={videoTheme.profit} />
                        <text x={30} y={19} textAnchor="middle" fill="#000" fontSize={13} fontWeight="900">SELL</text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </AbsoluteFill>
      )}

      {/* ========================================================
          SCENE 5: MARKET PATTERN WATCH (630 - 810 frames / 21s - 27s)
          ======================================================== */}
      {frame >= 625 && frame < 815 && (
        <AbsoluteFill style={{ padding: '140px 120px 80px', display: 'flex', flexDirection: 'column' }}>
          <ComicBadge text="ALERT!" subtext="Pattern Detector Active" delay={635} top="140px" left="140px" rotate={-12} bgColor="#FF3B30" />

          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            <span style={{ color: videoTheme.accentBright, fontSize: 24, fontWeight: 900, letterSpacing: 3 }}>
              FEATURE #4 — MARKET PATTERN WATCHER
            </span>
            <h2 style={{ fontSize: 48, fontWeight: 900, marginTop: 4 }}>
              Catch High-Probability Technical Setups Automatically
            </h2>
          </div>

          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 28 }}>
            {['Bullish Engulfing', 'Consecutive Move', 'Range Breakout'].map((pat, i) => (
              <div
                key={pat}
                style={{
                  borderRadius: 28,
                  background: videoTheme.card,
                  border: `3px solid ${videoTheme.border}`,
                  padding: 28,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transform: `scale(${spring({ frame: frame - 640 - i * 15, fps, config: { damping: 14 } })})`,
                }}
              >
                <div>
                  <span style={{ color: videoTheme.profit, fontSize: 16, fontWeight: 900 }}>● LIVE ALERT</span>
                  <div style={{ fontSize: 26, fontWeight: 900, marginTop: 8 }}>{pat}</div>
                </div>
                <div style={{ color: videoTheme.accentBright, fontSize: 18, fontWeight: 800 }}>
                  Confidence: 94%
                </div>
              </div>
            ))}
          </div>
        </AbsoluteFill>
      )}

      {/* ========================================================
          SCENE 6: EXPLOSIVE OUTRO & CTA (810 - 900 frames / 27s - 30s)
          ======================================================== */}
      {frame >= 805 && (
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <ComicStarburst delay={810} size={540} top="45%" left="50%" color="#34E7A0" />
          <ComicBadge text="KAPOW!" subtext="Start Journaling Today" delay={815} top="20%" right="30%" rotate={10} bgColor="#FF3B30" scale={1.2} />

          <div
            style={{
              transform: `scale(${spring({ frame: frame - 810, fps, config: { damping: 12 } })})`,
            }}
          >
            <div style={{ fontSize: 64, fontWeight: 900 }}>Elevate Your Trading Edge.</div>
            <div style={{ color: videoTheme.muted, fontSize: 28, marginTop: 12 }}>
              Everything you need to analyze, replay, and refine your trades.
            </div>

            <div
              style={{
                marginTop: 40,
                background: videoTheme.accent,
                color: videoTheme.foreground,
                padding: '20px 48px',
                borderRadius: 24,
                fontSize: 32,
                fontWeight: 900,
                boxShadow: `0 0 40px ${videoTheme.accent}88`,
                display: 'inline-block',
              }}
            >
              Start Free — Import First Trades →
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}

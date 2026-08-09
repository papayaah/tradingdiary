import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { BrandHeader } from '../components/BrandHeader';
import { getVideoTheme } from '../theme';

export function PatternPromo({ themeMode = 'dark' }: { themeMode?: 'light' | 'dark' }) {
  const videoTheme = getVideoTheme(themeMode);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phase calculation:
  // Phase 1: Consecutive Move (Frames 0 - 110)
  // Phase 2: Momentum Burst (Frames 110 - 220)
  // Phase 3: Engulfing Reversal (Frames 220 - 330)
  let phase = 1;
  let phaseFrame = frame;

  if (frame >= 220) {
    phase = 3;
    phaseFrame = frame - 220;
  } else if (frame >= 110) {
    phase = 2;
    phaseFrame = frame - 110;
  }

  const titleSpring = spring({ frame, fps, config: { damping: 18, stiffness: 130 } });
  const cardSpring = spring({ frame: phaseFrame, fps, config: { damping: 16, stiffness: 140 } });
  const badgeSpring = spring({ frame: phaseFrame - 25, fps, config: { damping: 12, stiffness: 180 } });

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
      {/* Brand Header with Owl SVG Logo */}
      <BrandHeader themeMode={themeMode} />

      {/* SINGLE FANCY HEADLINE (Zero Subtitles!) */}
      <div
        style={{
          position: 'absolute',
          top: 155,
          left: 48,
          right: 48,
          textAlign: 'center',
          opacity: titleSpring,
          transform: `translateY(${interpolate(titleSpring, [0, 1], [25, 0])}px)`,
        }}
      >
        <div
          style={{
            fontSize: 54,
            fontWeight: 900,
            letterSpacing: -1,
            background: `linear-gradient(135deg, ${videoTheme.foreground} 30%, ${videoTheme.accentBright})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textShadow: `0 8px 30px ${videoTheme.accent}44`,
            lineHeight: 1.1,
          }}
        >
          REAL-TIME PATTERN SCANNER
        </div>
      </div>

      {/* MAIN GRAPHICAL CHART CONTAINER (Dominates 85% of Height) */}
      <div
        style={{
          position: 'absolute',
          left: 48,
          right: 48,
          top: 250,
          bottom: 70,
          borderRadius: 44,
          background: videoTheme.card,
          border: `3px solid ${videoTheme.border}`,
          boxShadow: '0 40px 100px rgba(0,0,0,.6)',
          overflow: 'hidden',
          padding: 36,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        {/* Top Ticker & Live Status Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span
              style={{
                fontSize: 18,
                fontWeight: 850,
                color: videoTheme.muted,
                background: videoTheme.cardRaised,
                padding: '6px 16px',
                borderRadius: 12,
                border: `1px solid ${videoTheme.border}`,
              }}
            >
              5m Chart
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 18,
              fontWeight: 900,
              color: videoTheme.profit,
              background: `${videoTheme.profit}18`,
              border: `2px solid ${videoTheme.profit}44`,
              padding: '8px 20px',
              borderRadius: 20,
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: videoTheme.profit }} />
            {phase === 1 ? '3 GREEN CANDLES' : phase === 2 ? 'VOLUME EXPLOSION' : 'ENGULFING PAIR'}
          </div>
        </div>

        {/* HIGH-IMPACT SVG CANDLESTICK GRAPHICS */}
        <div style={{ flex: 1, position: 'relative', width: '100%', marginTop: 20 }}>
          <svg
            viewBox="0 0 960 1000"
            style={{
              width: '100%',
              height: '100%',
              overflow: 'visible',
              opacity: cardSpring,
              transform: `scale(${interpolate(cardSpring, [0, 1], [0.95, 1])})`,
            }}
          >
            {/* Gridlines */}
            {[0.2, 0.4, 0.6, 0.8].map((r) => (
              <line key={r} x1={20} x2={940} y1={r * 1000} y2={r * 1000} stroke={videoTheme.grid} strokeDasharray="10 14" strokeWidth={3} />
            ))}

            {/* PHASE 1: Bullish Consecutive Move (3 Stepping Green Candles) */}
            {phase === 1 && (
              <>
                {/* 3 Small Base Candles */}
                {[
                  { x: 100, y: 720, h: 40, green: true },
                  { x: 210, y: 740, h: 50, green: false },
                  { x: 320, y: 700, h: 45, green: true },
                ].map((c, i) => (
                  <g key={i}>
                    <line x1={c.x} x2={c.x} y1={c.y - 25} y2={c.y + c.h + 25} stroke={c.green ? videoTheme.profit : videoTheme.loss} strokeWidth={6} />
                    <rect x={c.x - 22} y={c.y} width={44} height={c.h} rx={10} fill={c.green ? videoTheme.profit : videoTheme.loss} />
                  </g>
                ))}

                {/* 3 Stepping Up Green Candles (Consecutive Move) */}
                {[
                  { x: 440, y: 580, h: 120, delay: 10 },
                  { x: 570, y: 410, h: 150, delay: 20 },
                  { x: 700, y: 210, h: 180, delay: 30 },
                ].map((c, i) => {
                  const progress = interpolate(phaseFrame - c.delay, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                  return (
                    <g key={i} style={{ opacity: progress }}>
                      <line x1={c.x} x2={c.x} y1={c.y - 40} y2={c.y + c.h + 40} stroke={videoTheme.profit} strokeWidth={8} />
                      <rect x={c.x - 30} y={c.y} width={60} height={c.h * progress} rx={14} fill={videoTheme.profit} />
                    </g>
                  );
                })}
              </>
            )}

            {/* PHASE 2: Momentum Burst (Explosive Green Candle + Volume Spike) */}
            {phase === 2 && (
              <>
                {/* Consolidation Candles */}
                {[
                  { x: 120, y: 620, h: 50, green: true },
                  { x: 240, y: 640, h: 60, green: false },
                  { x: 360, y: 610, h: 55, green: true },
                  { x: 480, y: 630, h: 45, green: false },
                ].map((c, i) => (
                  <g key={i}>
                    <line x1={c.x} x2={c.x} y1={c.y - 25} y2={c.y + c.h + 25} stroke={c.green ? videoTheme.profit : videoTheme.loss} strokeWidth={6} />
                    <rect x={c.x - 24} y={c.y} width={48} height={c.h} rx={10} fill={c.green ? videoTheme.profit : videoTheme.loss} />
                  </g>
                ))}

                {/* Massive Explosive Momentum Candle */}
                {(() => {
                  const progress = interpolate(phaseFrame, [5, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                  return (
                    <g style={{ opacity: progress }}>
                      <line x1={650} x2={650} y1={120} y2={760} stroke={videoTheme.profit} strokeWidth={10} />
                      <rect x={600} y={160} width={100} height={540 * progress} rx={20} fill={videoTheme.profit} />

                      {/* Volume Spike Bar at Bottom */}
                      <rect x={590} y={820} width={120} height={160 * progress} rx={14} fill={videoTheme.profit} opacity={0.7} />
                      <text x={650} y={800} textAnchor="middle" fill={videoTheme.profit} fontSize={22} fontWeight="900">
                        VOL SPIKE 3.8X
                      </text>
                    </g>
                  );
                })()}
              </>
            )}

            {/* PHASE 3: Engulfing Reversal (Red Candle Swallowed by Giant Green Candle) */}
            {phase === 3 && (
              <>
                {/* Red Bearish Candle */}
                <g>
                  <line x1={320} x2={320} y1={360} y2={640} stroke={videoTheme.loss} strokeWidth={8} />
                  <rect x={280} y={400} width={80} height={200} rx={16} fill={videoTheme.loss} />
                  <text x={320} y={350} textAnchor="middle" fill={videoTheme.loss} fontSize={22} fontWeight="900">
                    BEARISH
                  </text>
                </g>

                {/* Giant Bullish Engulfing Green Candle */}
                {(() => {
                  const progress = interpolate(phaseFrame, [5, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                  return (
                    <g style={{ opacity: progress }}>
                      {/* Highlight Outer Ring Box */}
                      <rect
                        x={250}
                        y={140}
                        width={380}
                        height={760}
                        rx={30}
                        fill="none"
                        stroke={videoTheme.profit}
                        strokeWidth={6}
                        strokeDasharray="14 10"
                      />

                      <line x1={510} x2={510} y1={180} y2={840} stroke={videoTheme.profit} strokeWidth={10} />
                      <rect x={450} y={220} width={120} height={580 * progress} rx={22} fill={videoTheme.profit} />
                      <text x={510} y={170} textAnchor="middle" fill={videoTheme.profit} fontSize={24} fontWeight="900">
                        ENGULFING
                      </text>
                    </g>
                  );
                })()}
              </>
            )}
          </svg>

          {/* DYNAMIC FLOATING PATTERN BADGE (No Emojis, No Symbols) */}
          {phaseFrame >= 20 && (
            <div
              style={{
                position: 'absolute',
                top: 40,
                right: 30,
                background: phase === 1 ? videoTheme.accent : phase === 2 ? videoTheme.profit : videoTheme.profit,
                color: phase === 2 || phase === 3 ? '#000000' : '#FFFFFF',
                padding: '22px 38px',
                borderRadius: 28,
                fontWeight: 900,
                boxShadow: `0 20px 60px ${phase === 1 ? videoTheme.accent : videoTheme.profit}66`,
                transform: `scale(${badgeSpring})`,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                zIndex: 30,
              }}
            >
              <span style={{ fontSize: 16, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.9 }}>
                PATTERN DETECTED
              </span>
              <span style={{ fontSize: 34, lineHeight: 1.1 }}>
                {phase === 1
                  ? 'Bullish Consecutive Move'
                  : phase === 2
                  ? 'Momentum Burst'
                  : 'Bullish Engulfing Reversal'}
              </span>
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
}

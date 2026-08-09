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

  const cardSpring = spring({ frame: phaseFrame, fps, config: { damping: 16, stiffness: 140 } });
  const badgeSpring = spring({ frame: phaseFrame - 20, fps, config: { damping: 12, stiffness: 180 } });

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
      {/* Brand Header: 170px Owl SVG Logo + "Price Action Alerts" Title (78px) */}
      <BrandHeader themeMode={themeMode} title="Price Action Alerts" logoSize={170} />

      {/* MAIN GRAPHICAL CHART CONTAINER */}
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
        }}
      >
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
            {/* Horizontal Gridlines */}
            {[0.2, 0.4, 0.6, 0.8].map((r) => (
              <line key={r} x1={20} x2={940} y1={r * 1000} y2={r * 1000} stroke={videoTheme.grid} strokeDasharray="10 14" strokeWidth={3} />
            ))}

            {/* PHASE 1: Bullish Consecutive Move (3 Stepping Green Candles Growing UPWARDS Bottom-to-Top) */}
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

                {/* 3 Stepping Up Green Candles Growing UPWARDS from Bottom to Top */}
                {[
                  { x: 440, yBase: 700, targetH: 120, delay: 10 },
                  { x: 570, yBase: 560, targetH: 150, delay: 20 },
                  { x: 700, yBase: 390, targetH: 180, delay: 30 },
                ].map((c, i) => {
                  const progress = interpolate(phaseFrame - c.delay, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                  const animatedH = c.targetH * progress;
                  const animatedY = c.yBase - animatedH; // Bottom-to-top growth!

                  return (
                    <g key={i} style={{ opacity: progress }}>
                      <line x1={c.x} x2={c.x} y1={animatedY - 40} y2={c.yBase + 40} stroke={videoTheme.profit} strokeWidth={8} />
                      <rect x={c.x - 30} y={animatedY} width={60} height={animatedH} rx={14} fill={videoTheme.profit} />
                    </g>
                  );
                })}
              </>
            )}

            {/* PHASE 2: Momentum Burst (Massive Green Candle Growing UPWARDS Bottom-to-Top) */}
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

                {/* Massive Green Momentum Candle Growing UPWARDS from Bottom to Top */}
                {(() => {
                  const progress = interpolate(phaseFrame, [5, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                  const yBase = 700;
                  const targetH = 540;
                  const animatedH = targetH * progress;
                  const animatedY = yBase - animatedH;

                  return (
                    <g style={{ opacity: progress }}>
                      <line x1={650} x2={650} y1={animatedY - 40} y2={yBase + 60} stroke={videoTheme.profit} strokeWidth={10} />
                      <rect x={600} y={animatedY} width={100} height={animatedH} rx={20} fill={videoTheme.profit} />

                      {/* Volume Spike Bar at Bottom */}
                      <rect x={590} y={820} width={120} height={160 * progress} rx={14} fill={videoTheme.profit} opacity={0.8} />
                      <text x={650} y={800} textAnchor="middle" fill={videoTheme.profit} fontSize={24} fontWeight="900">
                        VOL SPIKE 3.8X
                      </text>
                    </g>
                  );
                })()}
              </>
            )}

            {/* PHASE 3: Engulfing Reversal (Giant Green Candle Growing UPWARDS Bottom-to-Top) */}
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

                {/* Giant Bullish Engulfing Green Candle Growing UPWARDS */}
                {(() => {
                  const progress = interpolate(phaseFrame, [5, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                  const yBase = 800;
                  const targetH = 580;
                  const animatedH = targetH * progress;
                  const animatedY = yBase - animatedH;

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

                      <line x1={510} x2={510} y1={animatedY - 40} y2={yBase + 40} stroke={videoTheme.profit} strokeWidth={10} />
                      <rect x={450} y={animatedY} width={120} height={animatedH} rx={22} fill={videoTheme.profit} />
                      <text x={510} y={animatedY - 15} textAnchor="middle" fill={videoTheme.profit} fontSize={26} fontWeight="900">
                        ENGULFING
                      </text>
                    </g>
                  );
                })()}
              </>
            )}
          </svg>

          {/* OVERSIZED HIGH-IMPACT SIGNAL BADGE (Zero Sub-labels) */}
          {phaseFrame >= 20 && (
            <div
              style={{
                position: 'absolute',
                top: 40,
                right: 40,
                background: phase === 1 ? videoTheme.accent : videoTheme.profit,
                color: phase === 1 ? '#FFFFFF' : '#000000',
                padding: '28px 52px',
                borderRadius: 32,
                fontWeight: 900,
                boxShadow: `0 24px 80px ${phase === 1 ? videoTheme.accent : videoTheme.profit}77`,
                transform: `scale(${badgeSpring})`,
                zIndex: 30,
              }}
            >
              <span style={{ fontSize: 46, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1 }}>
                {phase === 1
                  ? 'Bullish Consecutive Move'
                  : phase === 2
                  ? 'Momentum Burst (+5.8%)'
                  : 'Bullish Engulfing Reversal'}
              </span>
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
}

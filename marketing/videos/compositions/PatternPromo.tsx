import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { AnimatedCandles } from '../components/AnimatedCandles';
import { BrandHeader } from '../components/BrandHeader';
import { BrandOutro } from '../components/BrandOutro';
import { Captions } from '../components/Captions';
import { PatternAlert } from '../components/PatternAlert';
import type { PatternPromoConfig } from '../types';
import { videoTheme } from '../theme';

export function PatternPromo({ pattern }: { pattern: PatternPromoConfig }) {
  const frame = useCurrentFrame();
  const directionColor = pattern.direction === 'bullish' ? videoTheme.profit : videoTheme.loss;
  const detectionOpacity = interpolate(frame, [145, 162], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(frame, [312, 329], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 84% 4%, ${videoTheme.accent}26, transparent 45%), ${videoTheme.background}`,
        fontFamily: 'Inter, SF Pro Display, Helvetica, Arial, sans-serif',
        opacity: fadeOut,
      }}
    >
      <BrandHeader />
      <Captions pattern={pattern} />

      <div
        style={{
          position: 'absolute',
          left: 68,
          right: 68,
          top: 505,
          height: 660,
          borderRadius: 48,
          background: videoTheme.card,
          border: `3px solid ${videoTheme.border}`,
          boxShadow: '0 30px 70px rgba(0,0,0,.38)',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', left: 48, right: 48, top: 38, display: 'flex', alignItems: 'center' }}>
          <div style={{ color: videoTheme.foreground, fontSize: 31, fontWeight: 850 }}>{pattern.symbol}</div>
          <div
            style={{
              color: videoTheme.muted,
              background: videoTheme.cardRaised,
              fontSize: 19,
              fontWeight: 750,
              borderRadius: 12,
              padding: '8px 14px',
              marginLeft: 17,
            }}
          >
            {pattern.interval}
          </div>
          <div style={{ color: videoTheme.profit, marginLeft: 'auto', fontSize: 19, fontWeight: 850, letterSpacing: 2 }}>
            LIVE
          </div>
        </div>

        <div style={{ position: 'absolute', left: 34, right: 34, top: 88, height: 470 }}>
          <AnimatedCandles pattern={pattern} />
        </div>

        <div
          style={{
            position: 'absolute',
            right: 44,
            top: 136,
            color: videoTheme.accentBright,
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: 2,
            opacity: detectionOpacity,
            textShadow: `0 0 18px ${videoTheme.accent}`,
          }}
        >
          ● DETECTED
        </div>

        <div
          style={{
            position: 'absolute',
            left: 48,
            right: 48,
            bottom: 0,
            height: 92,
            borderTop: `2px solid ${videoTheme.border}`,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div style={{ color: videoTheme.muted, fontSize: 21, fontWeight: 800, letterSpacing: 2.1 }}>
            {pattern.title.toUpperCase()}
          </div>
          <div style={{ color: directionColor, fontSize: 29, fontWeight: 900, marginLeft: 'auto' }}>{pattern.change}</div>
        </div>
      </div>

      <PatternAlert pattern={pattern} />
      <BrandOutro />
    </AbsoluteFill>
  );
}

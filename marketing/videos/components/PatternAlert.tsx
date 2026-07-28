import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { PatternPromoConfig } from '../types';
import { videoTheme } from '../theme';

export function PatternAlert({ pattern }: { pattern: PatternPromoConfig }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({
    frame: frame - 178,
    fps,
    config: { damping: 18, stiffness: 150 },
  });
  const directionColor = pattern.direction === 'bullish' ? videoTheme.profit : videoTheme.loss;

  return (
    <div
      style={{
        position: 'absolute',
        left: 68,
        right: 68,
        top: 1235,
        height: 220,
        borderRadius: 38,
        border: `3px solid ${videoTheme.accent}`,
        background: 'linear-gradient(135deg, #202B4B, #172033)',
        boxShadow: '0 28px 60px rgba(0,0,0,.38)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 40px',
        gap: 30,
        opacity: interpolate(enter, [0, 1], [0, 1]),
        transform: `translateY(${interpolate(enter, [0, 1], [50, 0])}px)`,
      }}
    >
      <div
        style={{
          width: 100,
          height: 100,
          borderRadius: 28,
          display: 'grid',
          placeItems: 'center',
          background: `${directionColor}1F`,
          color: directionColor,
          fontSize: 54,
          fontWeight: 900,
        }}
      >
        ↗
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ color: videoTheme.accentBright, fontSize: 21, fontWeight: 800, letterSpacing: 2.2 }}>
          PATTERN DETECTED
        </div>
        <div style={{ color: videoTheme.foreground, fontSize: 38, fontWeight: 850, marginTop: 10 }}>
          {pattern.alertTitle}
        </div>
        <div style={{ color: videoTheme.muted, fontSize: 23, marginTop: 8 }}>
          {pattern.alertDescription}
        </div>
      </div>
      <div
        style={{
          color: directionColor,
          background: `${directionColor}1F`,
          borderRadius: 22,
          padding: '12px 20px',
          fontSize: 20,
          fontWeight: 900,
        }}
      >
        {pattern.direction === 'bullish' ? 'BULLISH' : 'BEARISH'}
      </div>
    </div>
  );
}

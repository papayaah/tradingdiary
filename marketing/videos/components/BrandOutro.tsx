import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { videoTheme } from '../theme';

export function BrandOutro() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 255, fps, config: { damping: 18, stiffness: 130 } });

  return (
    <div
      style={{
        position: 'absolute',
        left: 216,
        right: 216,
        top: 1720,
        textAlign: 'center',
        opacity: enter,
        transform: `translateY(${interpolate(enter, [0, 1], [30, 0])}px)`,
      }}
    >
      <div
        style={{
          height: 92,
          borderRadius: 28,
          background: videoTheme.accent,
          color: videoTheme.foreground,
          display: 'grid',
          placeItems: 'center',
          fontSize: 32,
          fontWeight: 850,
        }}
      >
        Explore Trading Diary →
      </div>
      <div style={{ color: videoTheme.muted, fontSize: 21, fontWeight: 800, letterSpacing: 3, marginTop: 24 }}>
        TRADINGDIARY.APP
      </div>
    </div>
  );
}

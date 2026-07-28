import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { PatternPromoConfig } from '../types';
import { videoTheme } from '../theme';

export function Captions({ pattern }: { pattern: PatternPromoConfig }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const intro = spring({ frame, fps, config: { damping: 18, stiffness: 130 } });
  const explanation = spring({ frame: frame - 218, fps, config: { damping: 18, stiffness: 130 } });

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 185,
          width: '100%',
          textAlign: 'center',
          opacity: intro,
          transform: `translateY(${interpolate(intro, [0, 1], [35, 0])}px)`,
        }}
      >
        <div style={{ color: videoTheme.foreground, fontSize: 78, fontWeight: 900 }}>{pattern.headline[0]}</div>
        <div style={{ color: videoTheme.accentBright, fontSize: 78, fontWeight: 900 }}>{pattern.headline[1]}</div>
        <div style={{ color: videoTheme.muted, fontSize: 29, marginTop: 20 }}>{pattern.subhead}</div>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 1515,
          width: '100%',
          textAlign: 'center',
          opacity: explanation,
          transform: `translateY(${interpolate(explanation, [0, 1], [24, 0])}px)`,
        }}
      >
        <div style={{ color: videoTheme.foreground, fontSize: 45, fontWeight: 850 }}>{pattern.explanation}</div>
        <div style={{ color: videoTheme.muted, fontSize: 28, marginTop: 14 }}>
          Monitor every symbol in your watchlist — 24/7.
        </div>
      </div>
    </>
  );
}

import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BrandHeader } from '../components/BrandHeader';
import { DashboardReveal } from '../components/DashboardReveal';
import { FileDropAnimation } from '../components/FileDropAnimation';
import { FinderWindow } from '../components/FinderWindow';
import { videoTheme } from '../theme';

const IMPORT_PARTICLES = Array.from({ length: 20 }, (_, index) => ({
  angle: (Math.PI * 2 * index) / 20,
  distance: 180 + (index % 4) * 55,
  size: 8 + (index % 3) * 5,
  color: index % 3 === 0 ? videoTheme.profit : index % 3 === 1 ? videoTheme.accentBright : videoTheme.foreground,
}));

export function ImportPromo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const intro = spring({ frame, fps, config: { damping: 18, stiffness: 130 } });
  const payoff = spring({ frame: frame - 226, fps, config: { damping: 18, stiffness: 130 } });
  const flash = interpolate(frame, [116, 122, 132], [0, 0.9, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(frame, [342, 359], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const burst = interpolate(frame, [116, 132, 150], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const burstDistance = interpolate(frame, [116, 150], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 48%, ${videoTheme.accent}25, transparent 50%), ${videoTheme.background}`,
        fontFamily: 'Inter, SF Pro Display, Helvetica, Arial, sans-serif',
        opacity: fadeOut,
        overflow: 'hidden',
      }}
    >
      <BrandHeader />

      <div
        style={{
          position: 'absolute',
          top: 180,
          width: '100%',
          textAlign: 'center',
          opacity: intro,
          transform: `translateY(${interpolate(intro, [0, 1], [34, 0])}px)`,
        }}
      >
        <div style={{ color: videoTheme.foreground, fontSize: 72, fontWeight: 900 }}>Your IBKR statement.</div>
        <div style={{ color: videoTheme.accentBright, fontSize: 72, fontWeight: 900 }}>Your dashboard. Instantly.</div>
        <div style={{ color: videoTheme.muted, fontSize: 28, marginTop: 18 }}>One file. No spreadsheets. No manual entry.</div>
      </div>

      <FinderWindow />
      <FileDropAnimation />
      <DashboardReveal />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at 50% 58%, white, ${videoTheme.accent} 38%, transparent 70%)`,
          opacity: flash,
          pointerEvents: 'none',
        }}
      />
      {IMPORT_PARTICLES.map((particle, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            left: 540 + Math.cos(particle.angle) * particle.distance * burstDistance,
            top: 1125 + Math.sin(particle.angle) * particle.distance * burstDistance,
            width: particle.size,
            height: particle.size * 2.2,
            borderRadius: particle.size,
            background: particle.color,
            opacity: burst,
            transform: `rotate(${particle.angle + Math.PI / 2}rad)`,
            boxShadow: `0 0 18px ${particle.color}`,
          }}
        />
      ))}

      <div
        style={{
          position: 'absolute',
          left: 110,
          right: 110,
          bottom: 105,
          textAlign: 'center',
          opacity: payoff,
          transform: `translateY(${interpolate(payoff, [0, 1], [28, 0])}px)`,
        }}
      >
        <div style={{ color: videoTheme.foreground, fontSize: 48, fontWeight: 900 }}>Drop it. Review it. Know your game.</div>
        <div style={{ color: videoTheme.muted, fontSize: 25, marginTop: 14 }}>From statement to insight—in seconds.</div>
        <div
          style={{
            width: 540,
            height: 82,
            margin: '34px auto 0',
            borderRadius: 26,
            background: videoTheme.accent,
            color: videoTheme.foreground,
            display: 'grid',
            placeItems: 'center',
            fontSize: 29,
            fontWeight: 850,
          }}
        >
          Explore Trading Diary →
        </div>
      </div>
    </AbsoluteFill>
  );
}

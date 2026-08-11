import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BrandHeader } from '../components/BrandHeader';
import { DashboardReveal } from '../components/DashboardReveal';
import { FileDropAnimation } from '../components/FileDropAnimation';
import { FinderWindow } from '../components/FinderWindow';
import { getVideoTheme } from '../theme';

export function ImportPromo({ themeMode = 'dark' }: { themeMode?: 'light' | 'dark' }) {
  const videoTheme = getVideoTheme(themeMode);
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

  const importParticles = Array.from({ length: 20 }, (_, index) => ({
    angle: (Math.PI * 2 * index) / 20,
    distance: 180 + (index % 4) * 55,
    size: 8 + (index % 3) * 5,
    color: index % 3 === 0 ? videoTheme.profit : index % 3 === 1 ? videoTheme.accentBright : videoTheme.foreground,
  }));

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 15%, ${videoTheme.accent}35, transparent 65%), ${videoTheme.background}`,
        fontFamily: 'Inter, SF Pro Display, Helvetica, Arial, sans-serif',
        overflow: 'hidden',
      }}
    >
      <BrandHeader themeMode={themeMode} />

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

      {importParticles.map((particle, index) => {
        const x = Math.cos(particle.angle) * particle.distance * burstDistance;
        const y = Math.sin(particle.angle) * particle.distance * burstDistance;
        return (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: `calc(50% + ${x}px)`,
              top: `calc(47% + ${y}px)`,
              width: particle.size,
              height: particle.size,
              borderRadius: '50%',
              backgroundColor: particle.color,
              opacity: burst,
              pointerEvents: 'none',
              boxShadow: `0 0 16px ${particle.color}`,
            }}
          />
        );
      })}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#ffffff',
          opacity: flash,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          bottom: 120,
          left: 70,
          right: 70,
          textAlign: 'center',
          opacity: payoff,
          transform: `translateY(${interpolate(payoff, [0, 1], [24, 0])}px)`,
        }}
      >
        <div style={{ color: videoTheme.foreground, fontSize: 44, fontWeight: 800 }}>
          Interactive Brokers flex statements parsed automatically.
        </div>
        <div style={{ color: videoTheme.muted, fontSize: 28, marginTop: 10 }}>
          PnL, win rate, duration, and execution tags ready instantly.
        </div>
      </div>

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
        TRADING DIARY — MULTI-BROKER IMPORT
      </div>
    </AbsoluteFill>
  );
}

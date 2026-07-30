import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BrandHeader } from '../components/BrandHeader';
import { videoTheme } from '../theme';

const PNL_POINTS = [
  { x: 40, y: 380, val: 0, label: 'Jan 01' },
  { x: 140, y: 330, val: 1800, label: 'Jan 05' },
  { x: 240, y: 360, val: 1200, label: 'Jan 10' },
  { x: 340, y: 280, val: 4500, label: 'Jan 15' },
  { x: 440, y: 240, val: 6800, label: 'Jan 20' },
  { x: 540, y: 270, val: 5900, label: 'Jan 25' },
  { x: 640, y: 190, val: 11200, label: 'Feb 01' },
  { x: 740, y: 140, val: 14500, label: 'Feb 10' },
  { x: 840, y: 80, val: 18450, label: 'Feb 18' },
];

export function AnalyticsPromo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerSpring = spring({ frame, fps, config: { damping: 18, stiffness: 130 } });
  const card1Spring = spring({ frame: frame - 12, fps, config: { damping: 16, stiffness: 120 } });
  const card2Spring = spring({ frame: frame - 28, fps, config: { damping: 16, stiffness: 120 } });
  const fadeOut = interpolate(frame, [315, 329], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Line drawing progress (0 to 1 over frames 30 to 180)
  const lineProgress = interpolate(frame, [30, 180], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Animated P&L counter
  const currentPnL = Math.round(interpolate(lineProgress, [0, 1], [0, 18450]));

  // Win rate donut ring progress (0 to 0.685 over frames 50 to 160)
  const winRatePercent = interpolate(frame, [50, 160], [0, 68.5], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const winRateDashOffset = 377 - (377 * (winRatePercent / 100));

  // Hold time bar progress
  const winHoldWidth = interpolate(frame, [70, 170], [0, 80], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const lossHoldWidth = interpolate(frame, [70, 170], [0, 32], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Construct SVG Path
  const totalPoints = PNL_POINTS.length;
  const visiblePointsCount = Math.max(1, Math.ceil(lineProgress * totalPoints));
  const visiblePoints = PNL_POINTS.slice(0, visiblePointsCount);

  const pathD = visiblePoints.reduce((acc, pt, idx) => {
    return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, '');

  const areaD = visiblePoints.length > 1
    ? `${pathD} L ${visiblePoints[visiblePoints.length - 1].x} 420 L ${visiblePoints[0].x} 420 Z`
    : '';

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 20%, ${videoTheme.accent}30, transparent 60%), ${videoTheme.background}`,
        fontFamily: 'Inter, SF Pro Display, Helvetica, Arial, sans-serif',
        opacity: fadeOut,
        overflow: 'hidden',
      }}
    >
      <BrandHeader />

      {/* Header Copy */}
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
          VISUAL ANALYTICS
        </div>
        <div style={{ color: videoTheme.foreground, fontSize: 62, fontWeight: 900, marginTop: 6, lineHeight: 1.1 }}>
          Track Your Edge Live.
        </div>
      </div>

      {/* Main Cumulative P&L Card */}
      <div
        style={{
          position: 'absolute',
          left: 48,
          right: 48,
          top: 360,
          height: 640,
          borderRadius: 44,
          background: videoTheme.card,
          border: `3px solid ${videoTheme.border}`,
          boxShadow: '0 40px 100px rgba(0,0,0,.55)',
          overflow: 'hidden',
          padding: '36px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          opacity: card1Spring,
          transform: `scale(${interpolate(card1Spring, [0, 1], [0.94, 1])})`,
        }}
      >
        {/* Card Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ color: videoTheme.muted, fontSize: 20, fontWeight: 750, letterSpacing: 1.5 }}>
              CUMULATIVE P&L
            </div>
            <div style={{ color: videoTheme.profit, fontSize: 58, fontWeight: 900, marginTop: 4 }}>
              +${currentPnL.toLocaleString('en-US')}
            </div>
          </div>
          <div
            style={{
              background: `${videoTheme.profit}22`,
              border: `2px solid ${videoTheme.profit}44`,
              color: videoTheme.profit,
              padding: '10px 20px',
              borderRadius: 16,
              fontSize: 22,
              fontWeight: 850,
            }}
          >
            +124.5% Equity
          </div>
        </div>

        {/* SVG Equity Curve */}
        <div style={{ height: 440, width: '100%', position: 'relative' }}>
          <svg viewBox="0 0 880 440" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
            <defs>
              <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={videoTheme.profit} stopOpacity={0.4} />
                <stop offset="100%" stopColor={videoTheme.profit} stopOpacity={0.0} />
              </linearGradient>
            </defs>

            {/* Gridlines */}
            {[0.2, 0.4, 0.6, 0.8].map((r) => (
              <line key={r} x1={30} x2={850} y1={r * 400} y2={r * 400} stroke={videoTheme.grid} strokeDasharray="8 12" strokeWidth={2} />
            ))}

            {/* Filled Area */}
            {areaD && <path d={areaD} fill="url(#pnlGradient)" />}

            {/* Curve Line */}
            {pathD && <path d={pathD} fill="none" stroke={videoTheme.profit} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />}

            {/* Pulsing Active Endpoint */}
            {visiblePoints.length > 0 && (
              <circle
                cx={visiblePoints[visiblePoints.length - 1].x}
                cy={visiblePoints[visiblePoints.length - 1].y}
                r={12}
                fill={videoTheme.profit}
                stroke="#ffffff"
                strokeWidth={4}
              />
            )}
          </svg>
        </div>
      </div>

      {/* Second Card: Win Rate Donut & Hold Time Comparison */}
      <div
        style={{
          position: 'absolute',
          left: 48,
          right: 48,
          top: 1040,
          bottom: 120,
          borderRadius: 44,
          background: videoTheme.card,
          border: `3px solid ${videoTheme.border}`,
          boxShadow: '0 40px 100px rgba(0,0,0,.55)',
          overflow: 'hidden',
          padding: '40px',
          display: 'flex',
          gap: 36,
          alignItems: 'center',
          opacity: card2Spring,
          transform: `scale(${interpolate(card2Spring, [0, 1], [0.94, 1])})`,
        }}
      >
        {/* Win Rate Donut Ring */}
        <div style={{ width: 320, height: 320, position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', justifyCenter: 'center' }}>
          <svg viewBox="0 0 160 160" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
            {/* Background Ring */}
            <circle cx="80" cy="80" r="60" fill="none" stroke={videoTheme.cardRaised} strokeWidth="18" />
            {/* Loss Arc */}
            <circle cx="80" cy="80" r="60" fill="none" stroke={videoTheme.loss} strokeWidth="18" strokeDasharray="377" strokeDashoffset="0" opacity={0.6} />
            {/* Animated Win Arc */}
            <circle
              cx="80"
              cy="80"
              r="60"
              fill="none"
              stroke={videoTheme.profit}
              strokeWidth="18"
              strokeDasharray="377"
              strokeDashoffset={winRateDashOffset}
              strokeLinecap="round"
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ color: videoTheme.muted, fontSize: 18, fontWeight: 800 }}>WIN RATE</div>
            <div style={{ color: videoTheme.foreground, fontSize: 48, fontWeight: 900, marginTop: 2 }}>
              {winRatePercent.toFixed(1)}%
            </div>
            <div style={{ color: videoTheme.profit, fontSize: 18, fontWeight: 800, marginTop: 2 }}>
              48W / 22L
            </div>
          </div>
        </div>

        {/* Hold Time & Stats Column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 }}>
          <div>
            <div style={{ color: videoTheme.muted, fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
              AVG HOLD TIME
            </div>
            {/* Winning Hold Bar */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, color: videoTheme.foreground, marginBottom: 4 }}>
                <span>Winning Trades</span>
                <span style={{ color: videoTheme.profit }}>45 mins</span>
              </div>
              <div style={{ height: 16, background: videoTheme.cardRaised, borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ width: `${winHoldWidth}%`, height: '100%', background: videoTheme.profit, borderRadius: 8 }} />
              </div>
            </div>
            {/* Losing Hold Bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, color: videoTheme.foreground, marginBottom: 4 }}>
                <span>Losing Trades</span>
                <span style={{ color: videoTheme.loss }}>14 mins</span>
              </div>
              <div style={{ height: 16, background: videoTheme.cardRaised, borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ width: `${lossHoldWidth}%`, height: '100%', background: videoTheme.loss, borderRadius: 8 }} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 24, borderTop: `2px solid ${videoTheme.border}`, paddingTop: 20 }}>
            <div>
              <div style={{ color: videoTheme.muted, fontSize: 16, fontWeight: 800 }}>PROFIT FACTOR</div>
              <div style={{ color: videoTheme.accentBright, fontSize: 32, fontWeight: 900 }}>2.64</div>
            </div>
            <div>
              <div style={{ color: videoTheme.muted, fontSize: 16, fontWeight: 800 }}>AVG TRADE</div>
              <div style={{ color: videoTheme.profit, fontSize: 32, fontWeight: 900 }}>+$263.57</div>
            </div>
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
        TRADING DIARY — ANALYTICS ENGINE
      </div>
    </AbsoluteFill>
  );
}

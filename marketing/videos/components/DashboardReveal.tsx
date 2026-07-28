import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { videoTheme } from '../theme';

const metrics = [
  ['NET P&L', '$6,008.30', videoTheme.profit],
  ['TOTAL TRADES', '886', videoTheme.foreground],
  ['WIN RATE', '63%', videoTheme.foreground],
];

const calendarValues = [0, 0.2, -0.1, 0.45, 0.7, 0, -0.25, 0.32, 0.55, 0.1, 0, 0.8, -0.35, 0.24, 0.62, 0, 0.38, 0.74, -0.18, 0.5];

export function DashboardReveal() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 126, fps, config: { damping: 18, stiffness: 120 } });
  const chartProgress = interpolate(frame, [158, 220], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        position: 'absolute',
        left: 54,
        right: 54,
        top: 330,
        height: 1190,
        borderRadius: 46,
        border: `3px solid ${videoTheme.border}`,
        background: videoTheme.card,
        boxShadow: '0 45px 100px rgba(0,0,0,.48)',
        padding: 42,
        opacity: enter,
        transform: `scale(${interpolate(enter, [0, 1], [0.82, 1])})`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div>
          <div style={{ color: videoTheme.muted, fontSize: 21, fontWeight: 800, letterSpacing: 2 }}>YOUR TRADING OVERVIEW</div>
          <div style={{ color: videoTheme.foreground, fontSize: 46, fontWeight: 900, marginTop: 8 }}>Dashboard</div>
        </div>
        <div style={{ marginLeft: 'auto', color: videoTheme.profit, background: `${videoTheme.profit}1C`, borderRadius: 22, padding: '12px 20px', fontSize: 20, fontWeight: 800 }}>
          ✓ Import complete
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginTop: 36 }}>
        {metrics.map(([label, value, color], index) => {
          const metricIn = spring({ frame: frame - 145 - index * 7, fps, config: { damping: 16, stiffness: 160 } });
          return (
            <div key={label} style={{ background: videoTheme.cardRaised, border: `2px solid ${videoTheme.border}`, borderRadius: 24, padding: 24, opacity: metricIn, transform: `translateY(${interpolate(metricIn, [0, 1], [22, 0])}px)` }}>
              <div style={{ color: videoTheme.muted, fontSize: 17, fontWeight: 800, letterSpacing: 1.5 }}>{label}</div>
              <div style={{ color, fontSize: 38, fontWeight: 900, marginTop: 12 }}>{value}</div>
            </div>
          );
        })}
      </div>

      <div style={{ background: videoTheme.cardRaised, border: `2px solid ${videoTheme.border}`, borderRadius: 28, marginTop: 24, padding: 28, height: 350 }}>
        <div style={{ color: videoTheme.foreground, fontSize: 24, fontWeight: 850 }}>Cumulative P&L</div>
        <svg viewBox="0 0 850 245" style={{ width: '100%', height: 250, marginTop: 10 }}>
          <defs>
            <linearGradient id="profitArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={videoTheme.profit} stopOpacity=".35" />
              <stop offset="100%" stopColor={videoTheme.profit} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M20 205 C100 194, 122 166, 180 174 S260 132, 320 148 S400 98, 470 114 S550 74, 620 88 S720 40, 830 28 L830 225 L20 225Z" fill="url(#profitArea)" opacity={chartProgress} />
          <path d="M20 205 C100 194, 122 166, 180 174 S260 132, 320 148 S400 98, 470 114 S550 74, 620 88 S720 40, 830 28" fill="none" stroke={videoTheme.profit} strokeWidth="8" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - chartProgress} />
        </svg>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 24, marginTop: 24 }}>
        <div style={{ background: videoTheme.cardRaised, border: `2px solid ${videoTheme.border}`, borderRadius: 28, padding: 26 }}>
          <div style={{ color: videoTheme.foreground, fontSize: 23, fontWeight: 850 }}>Trading calendar</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginTop: 20 }}>
            {calendarValues.map((value, index) => (
              <div key={index} style={{ height: 54, borderRadius: 10, background: value === 0 ? videoTheme.border : value > 0 ? `${videoTheme.profit}${Math.round(30 + value * 120).toString(16).padStart(2, '0')}` : `${videoTheme.loss}77`, opacity: interpolate(frame, [174 + index * 2, 190 + index * 2], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }} />
            ))}
          </div>
        </div>
        <div style={{ background: videoTheme.cardRaised, border: `2px solid ${videoTheme.border}`, borderRadius: 28, padding: 26 }}>
          <div style={{ color: videoTheme.foreground, fontSize: 23, fontWeight: 850 }}>Latest session</div>
          {[
            ['NVDA', '+$842', videoTheme.profit],
            ['AMD', '+$516', videoTheme.profit],
            ['TSLA', '-$184', videoTheme.loss],
          ].map(([symbol, pnl, color]) => (
            <div key={symbol} style={{ display: 'flex', padding: '22px 0', borderBottom: `2px solid ${videoTheme.border}`, fontSize: 22, fontWeight: 800 }}>
              <span style={{ color: videoTheme.foreground }}>{symbol}</span>
              <span style={{ color, marginLeft: 'auto' }}>{pnl}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

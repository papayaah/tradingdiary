import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { BrandHeader } from '../components/BrandHeader';
import { getVideoTheme } from '../theme';

const REPLAY_CANDLES = [
  { open: 150.0, high: 152.5, low: 149.2, close: 152.0, time: '09:30 AM' },
  { open: 152.0, high: 154.1, low: 151.8, close: 153.8, time: '09:35 AM' },
  { open: 153.8, high: 153.9, low: 151.2, close: 151.5, time: '09:40 AM' },
  { open: 151.5, high: 155.0, low: 151.5, close: 154.6, time: '09:45 AM', action: 'BUY', price: 152.1 },
  { open: 154.6, high: 157.8, low: 154.0, close: 157.2, time: '09:50 AM' },
  { open: 157.2, high: 160.4, low: 156.9, close: 159.9, time: '09:55 AM' },
  { open: 159.9, high: 163.5, low: 159.5, close: 163.0, time: '10:00 AM' },
  { open: 163.0, high: 165.2, low: 162.8, close: 164.8, time: '10:05 AM', action: 'SELL', price: 164.5 },
];

export function ReplayPromo({ themeMode = 'dark' }: { themeMode?: 'light' | 'dark' }) {
  const videoTheme = getVideoTheme(themeMode);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const windowSpring = spring({ frame: frame - 10, fps, config: { damping: 16, stiffness: 120 } });
  const fadeOut = interpolate(frame, [315, 329], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Replay animation timeline: 8 candles revealed progressively from frame 35 to 220
  const activeCandleIndex = Math.min(
    REPLAY_CANDLES.length - 1,
    Math.max(0, Math.floor(interpolate(frame, [35, 220], [0, REPLAY_CANDLES.length - 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })))
  );

  const progressPercent = Math.min(100, Math.max(0, interpolate(frame, [35, 220], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })));

  // Compute live P&L based on progress
  const buyTriggered = frame >= 80;
  const sellTriggered = frame >= 195;
  let pnlValue = 0;

  if (sellTriggered) {
    pnlValue = 1240.00;
  } else if (buyTriggered) {
    const currentClose = REPLAY_CANDLES[activeCandleIndex].close;
    pnlValue = Math.round((currentClose - 152.1) * 100);
  }

  const pnlColor = pnlValue >= 0 ? videoTheme.profit : videoTheme.loss;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 15%, ${videoTheme.accent}35, transparent 65%), ${videoTheme.background}`,
        fontFamily: 'Inter, SF Pro Display, Helvetica, Arial, sans-serif',
        opacity: fadeOut,
        overflow: 'hidden',
      }}
    >
      {/* Brand Header: 170px Owl SVG Logo + "Trade Replay" Title (78px) */}
      <BrandHeader themeMode={themeMode} title="Trade Replay" logoSize={170} />

      {/* Main Replay Card Window (Top: 220, Bottom: 40) */}
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
          display: 'flex',
          flexDirection: 'column',
          opacity: windowSpring,
          transform: `scale(${interpolate(windowSpring, [0, 1], [0.95, 1])})`,
        }}
      >
        {/* Window Control Header */}
        <div
          style={{
            height: 96,
            background: videoTheme.cardRaised,
            borderBottom: `2px solid ${videoTheme.border}`,
            padding: '0 36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#FF5F56' }} />
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#FFBD2E' }} />
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#27C93F' }} />
            <span style={{ color: videoTheme.foreground, fontWeight: 850, fontSize: 26, marginLeft: 16 }}>
              5m Bar-by-Bar Replay
            </span>
          </div>

          <div
            style={{
              background: videoTheme.profit,
              color: '#000000',
              padding: '12px 26px',
              borderRadius: 20,
              fontSize: 22,
              fontWeight: 900,
              boxShadow: `0 0 30px ${videoTheme.profit}55`,
            }}
          >
            ▶ REPLAY ACTIVE
          </div>
        </div>

        {/* Live P&L Header */}
        <div
          style={{
            padding: '36px 44px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: `linear-gradient(180deg, ${videoTheme.cardRaised}40 0%, transparent 100%)`,
          }}
        >
          <div>
            <div style={{ color: videoTheme.muted, fontSize: 22, fontWeight: 800, letterSpacing: 1.5 }}>UNREALIZED P&L</div>
            <div style={{ color: pnlColor, fontSize: 62, fontWeight: 900, marginTop: 4 }}>
              {pnlValue >= 0 ? `+$${pnlValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : `-$${Math.abs(pnlValue).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: videoTheme.muted, fontSize: 22, fontWeight: 800, letterSpacing: 1.5 }}>BAR TIME</div>
            <div style={{ color: videoTheme.foreground, fontSize: 36, fontWeight: 900, marginTop: 4 }}>
              {REPLAY_CANDLES[activeCandleIndex].time}
            </div>
          </div>
        </div>

        {/* Scaled SVG Chart Area Filling Vertical Space */}
        <div style={{ flex: 1, padding: '20px 36px', position: 'relative' }}>
          <svg viewBox="0 0 880 720" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
            {/* Horizontal Grid Lines */}
            {[0.15, 0.35, 0.55, 0.75, 0.95].map((r) => (
              <line key={r} x1={30} x2={850} y1={r * 680} y2={r * 680} stroke={videoTheme.grid} strokeDasharray="8 12" strokeWidth={2} />
            ))}

            {/* Candlesticks (Bottom-to-Top Growth Math) */}
            {REPLAY_CANDLES.slice(0, activeCandleIndex + 1).map((candle, idx) => {
              const x = 90 + idx * 100;
              const minP = 148.0;
              const maxP = 166.0;
              const y = (p: number) => 640 - ((p - minP) / (maxP - minP)) * 580;
              const bullish = candle.close >= candle.open;
              const color = bullish ? videoTheme.profit : videoTheme.loss;
              const openY = y(candle.open);
              const closeY = y(candle.close);
              const topY = Math.min(openY, closeY);
              const bodyHeight = Math.max(14, Math.abs(closeY - openY));

              return (
                <g key={idx}>
                  {/* High Low Wick */}
                  <line x1={x} x2={x} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth={8} strokeLinecap="round" />
                  {/* Candle Body */}
                  <rect x={x - 24} y={topY} width={48} height={bodyHeight} rx={10} fill={color} />

                  {/* Buy Marker */}
                  {candle.action === 'BUY' && (
                    <g transform={`translate(${x - 50}, ${y(candle.low) + 36})`}>
                      <rect width={100} height={44} rx={12} fill={videoTheme.profit} />
                      <text x={50} y={29} textAnchor="middle" fill="#000000" fontSize={18} fontWeight="900">
                        BUY $152.1
                      </text>
                    </g>
                  )}

                  {/* Sell Marker */}
                  {candle.action === 'SELL' && (
                    <g transform={`translate(${x - 52}, ${y(candle.high) - 58})`}>
                      <rect width={104} height={44} rx={12} fill={videoTheme.profit} />
                      <text x={52} y={29} textAnchor="middle" fill="#000000" fontSize={18} fontWeight="900">
                        SELL $164.5
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Bottom Control Bar */}
        <div
          style={{
            height: 96,
            background: videoTheme.cardRaised,
            borderTop: `2px solid ${videoTheme.border}`,
            padding: '0 40px',
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            flexShrink: 0,
          }}
        >
          <div style={{ color: videoTheme.accentBright, fontSize: 26, fontWeight: 900 }}>
            ❚❚ 1x Speed
          </div>

          <div style={{ flex: 1, height: 18, borderRadius: 9, background: videoTheme.border, overflow: 'hidden' }}>
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                background: videoTheme.profit,
                borderRadius: 9,
              }}
            />
          </div>

          <div style={{ color: videoTheme.muted, fontSize: 22, fontWeight: 800 }}>
            {activeCandleIndex + 1} / {REPLAY_CANDLES.length} Bars
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

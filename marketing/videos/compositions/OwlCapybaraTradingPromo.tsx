import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CartoonOwl } from '../components/CartoonOwl';
import { CartoonCapybara } from '../components/CartoonCapybara';

export function OwlCapybaraTradingPromo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Story Timeline:
  // Phase 1 (Frame 0-90): Capybara is typing & trading at computer.
  // Phase 2 (Frame 90-180): Huge Momentum Burst candle forms on chart -> triggers Price Action Alert!
  // Phase 3 (Frame 180-270): Cartoon Owl logo mascot flies in & Capybara makes automatic buy purchase!

  const chartProgress = interpolate(frame, [30, 110], [20, 180], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const alertSpring = spring({ frame: Math.max(0, frame - 95), fps, config: { damping: 12, stiffness: 140 } });
  const owlFlyIn = spring({ frame: Math.max(0, frame - 160), fps, config: { damping: 14, stiffness: 120 } });
  const buyExecutedSpring = spring({ frame: Math.max(0, frame - 200), fps, config: { damping: 10, stiffness: 150 } });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0B0F17',
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#FFFFFF',
        padding: 40,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Logo */}
          <div style={{ width: 44, height: 44, borderRadius: 999, background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #0F172A' }}>
            <span style={{ fontSize: 20 }}>🦉</span>
          </div>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>Trading Diary Alerts</h2>
            <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>Automated Momentum Scanner & Execution</p>
          </div>
        </div>

        <div style={{ background: '#1E293B', border: '1px solid #334155', padding: '10px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700, color: '#10B981' }}>
          ● LIVE SCANNER ACTIVE
        </div>
      </div>

      {/* Main 2-Column Split: Left Chart Alert Card vs Right Mascot Desk Scene */}
      <div style={{ display: 'grid', gridTemplateColumns: '480px 1fr', gap: 40, flex: 1 }}>
        {/* LEFT COLUMN: Momentum Burst Price Action Alert Card */}
        <div
          style={{
            background: '#121826',
            border: '2px solid #1E293B',
            borderRadius: 24,
            padding: 28,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <span style={{ fontSize: 18, fontWeight: 800 }}>Price Action Alerts</span>
            <span style={{ fontSize: 13, background: '#1E293B', color: '#94A3B8', padding: '4px 10px', borderRadius: 8 }}>NVDA • 5m</span>
          </div>

          {/* Candlestick Chart Area */}
          <div style={{ flex: 1, background: '#0F172A', borderRadius: 16, border: '1px solid #1E293B', position: 'relative', overflow: 'hidden', padding: 20 }}>
            {/* Grid lines */}
            <div style={{ position: 'absolute', inset: 0, opacity: 0.1, backgroundImage: 'radial-gradient(#FFFFFF 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

            {/* Small setup candles */}
            <div style={{ position: 'absolute', bottom: 60, left: 40, display: 'flex', alignItems: 'flex-end', gap: 16 }}>
              <div style={{ width: 14, height: 24, background: '#10B981', borderRadius: 3, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 6, top: -10, bottom: -10, width: 2, background: '#10B981' }} />
              </div>
              <div style={{ width: 14, height: 32, background: '#EF4444', borderRadius: 3, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 6, top: -8, bottom: -8, width: 2, background: '#EF4444' }} />
              </div>
              <div style={{ width: 14, height: 28, background: '#10B981', borderRadius: 3, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 6, top: -6, bottom: -6, width: 2, background: '#10B981' }} />
              </div>
              <div style={{ width: 14, height: 20, background: '#EF4444', borderRadius: 3, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 6, top: -12, bottom: -12, width: 2, background: '#EF4444' }} />
              </div>

              {/* HUGE MOMENTUM BURST CANDLE */}
              <div
                style={{
                  width: 36,
                  height: chartProgress,
                  background: '#10B981',
                  borderRadius: 8,
                  position: 'relative',
                  boxShadow: '0 0 25px rgba(16,185,129,0.5)',
                }}
              >
                <div style={{ position: 'absolute', left: 17, top: -16, bottom: -16, width: 3, background: '#10B981' }} />
              </div>
            </div>

            {/* MOMENTUM BURST BADGE ALERT */}
            {frame >= 90 && (
              <div
                style={{
                  position: 'absolute',
                  top: 30,
                  right: 30,
                  background: '#10B981',
                  color: '#FFFFFF',
                  padding: '12px 24px',
                  borderRadius: 16,
                  fontWeight: 900,
                  fontSize: 18,
                  boxShadow: '0 10px 30px rgba(16,185,129,0.6)',
                  textAlign: 'center',
                  opacity: alertSpring,
                  transform: `scale(${alertSpring}) translateY(${interpolate(alertSpring, [0, 1], [-20, 0])}px)`,
                }}
              >
                Momentum Burst
              </div>
            )}
          </div>

          {/* BUY ORDER EXECUTED BANNER */}
          {frame >= 200 && (
            <div
              style={{
                marginTop: 20,
                background: '#2563EB',
                color: '#FFFFFF',
                padding: '16px 20px',
                borderRadius: 16,
                fontWeight: 900,
                fontSize: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 10px 25px rgba(37,99,235,0.4)',
                opacity: buyExecutedSpring,
                transform: `scale(${buyExecutedSpring})`,
              }}
            >
              <span>⚡ AUTO PURCHASE EXECUTED</span>
              <span>100 Shares @ $128.50</span>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Cartoon Capybara & Cartoon Owl Mascot Scene */}
        <div style={{ background: '#121826', border: '2px solid #1E293B', borderRadius: 24, padding: 40, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
          {/* Header Title */}
          <div>
            <h2 style={{ fontSize: 32, fontWeight: 900, marginBottom: 8, color: '#F8FAFC' }}>
              {frame < 90 ? 'Capybara is scanning the market...' : frame < 180 ? '🚨 Momentum Alert Triggered!' : '🎉 Trade Auto-Purchased!'}
            </h2>
            <p style={{ fontSize: 16, color: '#94A3B8', margin: 0 }}>
              Real-time pattern detection automatically executes trades when conditions align.
            </p>
          </div>

          {/* Cartoon Character Scene Floor Stage */}
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: 320, position: 'relative' }}>
            {/* Capybara Mascot at Desk */}
            <div style={{ transform: frame >= 200 ? 'scale(1.08)' : 'none', transition: 'transform 0.3s ease' }}>
              <CartoonCapybara isTyping={frame < 180} isCelebrating={frame >= 180} size={260} />
            </div>

            {/* Cartoon Owl Logo Mascot (Flies in on Alert) */}
            <div
              style={{
                opacity: owlFlyIn,
                transform: `scale(${owlFlyIn}) translateY(${interpolate(owlFlyIn, [0, 1], [-80, 0])}px)`,
              }}
            >
              <CartoonOwl size={240} isExcited={frame >= 180} wingWave={frame >= 180} />
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

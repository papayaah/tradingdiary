import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BrandHeader } from '../components/BrandHeader';
import { getVideoTheme } from '../theme';

export function IBKRGuidePromo({ themeMode = 'light' }: { themeMode?: 'light' | 'dark' }) {
  const videoTheme = getVideoTheme(themeMode);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animation timing (300 frames = 10s at 30fps)
  const intro = spring({ frame, fps, config: { damping: 18, stiffness: 130 } });

  // Keyframes
  // Step 1: Nav Bar focus (Frame 15 - 80)
  const step1 = spring({ frame: frame - 15, fps, config: { damping: 12, stiffness: 180 } });
  
  // Step 2: Dropdown menu & TradeLog selection (Frame 85 - 160)
  const step2 = spring({ frame: frame - 85, fps, config: { damping: 12, stiffness: 180 } });
  
  // Step 3: Download Button Pulse & Click (Frame 165 - 250)
  const step3 = spring({ frame: frame - 165, fps, config: { damping: 12, stiffness: 180 } });

  // Comic bounce effect for arrows
  const comicBounce = Math.sin(frame / 3) * 10;
  const comicScale = 1 + Math.sin(frame / 4) * 0.06;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 15%, ${videoTheme.accent}35, transparent 65%), ${videoTheme.background}`,
        fontFamily: 'Inter, SF Pro Display, Helvetica, Arial, sans-serif',
        overflow: 'hidden',
      }}
    >
      <BrandHeader themeMode={themeMode} />

      {/* Header Title */}
      <div
        style={{
          position: 'absolute',
          top: 135,
          width: '100%',
          textAlign: 'center',
          opacity: intro,
          transform: `translateY(${interpolate(intro, [0, 1], [24, 0])}px)`,
        }}
      >
        <div style={{ color: videoTheme.accent, fontSize: 22, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase' }}>
          IBKR Quick Export Guide
        </div>
        <div style={{ color: videoTheme.foreground, fontSize: 54, fontWeight: 900, marginTop: 4 }}>
          How to Download TradeLog
        </div>
      </div>

      {/* IBKR UI Window Container */}
      <div
        style={{
          position: 'absolute',
          top: 275,
          left: 45,
          right: 45,
          height: 1230,
          borderRadius: 24,
          border: `3px solid #0f172a`,
          backgroundColor: '#ffffff',
          boxShadow: '0 25px 60px rgba(0,0,0,0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* IBKR Header Navigation */}
        <div
          style={{
            height: 76,
            backgroundColor: '#ffffff',
            borderBottom: `3px solid #0f172a`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 28px',
            justifyContent: 'space-between',
            position: 'relative',
            zIndex: frame < 85 ? 50 : 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: '#ef4444' }} />
            <div style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: '#f59e0b' }} />
            <div style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: '#10b981' }} />
            <span style={{ color: '#d97706', fontWeight: 900, fontSize: 22, marginLeft: 16 }}>InteractiveBrokers</span>
          </div>

          <div style={{ display: 'flex', gap: 28, fontSize: 18, fontWeight: 700, color: '#4b5563' }}>
            <span>Portfolio</span>
            <span>Trade</span>
            <span>Research</span>
            <span>Transfer & Pay</span>
            
            {/* Step 1 Target */}
            <span
              style={{
                color: '#2563eb',
                borderBottom: `3px solid #2563eb`,
                paddingBottom: 4,
                position: 'relative',
                fontWeight: 900,
              }}
            >
              Performance & Reports

              {/* Step 1 Oversized Comic Arrow Pointer */}
              {frame >= 15 && frame < 85 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 55 + comicBounce,
                    left: '50%',
                    transform: `translateX(-50%) scale(${comicScale})`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    opacity: interpolate(step1, [0, 1], [0, 1]),
                    zIndex: 100,
                  }}
                >
                  <svg width="60" height="40" viewBox="0 0 60 40" fill="none">
                    <path d="M30 0L55 35H5L30 0Z" fill="#2563eb" stroke="#0f172a" strokeWidth="4" strokeLinejoin="round" />
                  </svg>
                  <div
                    style={{
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      fontSize: 22,
                      fontWeight: 900,
                      padding: '10px 20px',
                      borderRadius: 16,
                      border: '4px solid #0f172a',
                      boxShadow: '6px 6px 0px #0f172a',
                      whiteSpace: 'nowrap',
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                    }}
                  >
                    1. CLICK HERE!
                  </div>
                </div>
              )}
            </span>
            <span>Education</span>
          </div>
        </div>

        {/* IBKR Body Content */}
        <div style={{ flex: 1, padding: 36, backgroundColor: '#f8fafc', position: 'relative' }}>
          
          {/* DYNAMIC BACKDROP DIMMING OVERLAY */}
          {frame >= 15 && frame < 270 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                backdropFilter: 'blur(2px)',
                zIndex: 20,
                pointerEvents: 'none',
                opacity: frame < 25 ? interpolate(frame, [15, 25], [0, 1]) : 1,
                transition: 'opacity 0.3s ease',
              }}
            />
          )}

          <div style={{ color: '#0f172a', fontSize: 32, fontWeight: 900, marginBottom: 20 }}>
            Third-Party Reports
          </div>

          {/* Sub-tabs */}
          <div
            style={{
              display: 'flex',
              gap: 28,
              borderBottom: `2px solid #e2e8f0`,
              paddingBottom: 14,
              marginBottom: 36,
              color: '#64748b',
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            <span>Statements</span>
            <span>Flex Queries</span>
            <span>Other Reports</span>
            <span>Tax Documents</span>
            <span
              style={{
                color: '#2563eb',
                fontWeight: 900,
                borderBottom: `3px solid #2563eb`,
                paddingBottom: 14,
              }}
            >
              Third-Party Reports
            </span>
            <span>Transaction History</span>
          </div>

          {/* Main Grid Layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.1fr', gap: 28 }}>
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 16,
                padding: 28,
                backgroundColor: '#ffffff',
                height: 390,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
                fontSize: 18,
              }}
            >
              No active third-party services.
            </div>

            {/* Right Panel: Third-Party Downloads Box */}
            <div
              style={{
                border: `4px solid ${frame >= 85 ? '#2563eb' : '#0f172a'}`,
                borderRadius: 20,
                padding: 28,
                backgroundColor: '#ffffff',
                boxShadow: frame >= 85 ? '0 0 0 10px rgba(37,99,235,0.2), 10px 10px 0px #0f172a' : '6px 6px 0px #cbd5e1',
                position: 'relative',
                zIndex: frame >= 85 ? 30 : 10,
              }}
            >
              <div style={{ color: '#0f172a', fontSize: 24, fontWeight: 900, marginBottom: 20 }}>
                Third-Party Downloads
              </div>

              {/* Provider Field */}
              <div style={{ marginBottom: 24, position: 'relative' }}>
                <label style={{ display: 'block', color: '#475569', fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
                  Provider
                </label>

                {/* Dropdown Input */}
                <div
                  style={{
                    border: `3px solid ${frame >= 85 && frame < 165 ? '#2563eb' : '#0f172a'}`,
                    borderRadius: 14,
                    padding: '14px 18px',
                    backgroundColor: frame >= 85 && frame < 165 ? '#eff6ff' : '#ffffff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 20,
                    fontWeight: 900,
                    color: frame >= 115 ? '#0f172a' : '#64748b',
                  }}
                >
                  <span>{frame >= 115 ? 'TradeLog' : 'Select Provider...'}</span>
                  <span style={{ fontSize: 16, color: '#2563eb', fontWeight: 900 }}>▼</span>
                </div>

                {/* OVERSIZED COMIC POINTER 2 (Left side pointing right) */}
                {frame >= 85 && frame < 165 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -10,
                      left: -290 + comicBounce,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      opacity: interpolate(step2, [0, 1], [0, 1]),
                      transform: `scale(${comicScale})`,
                      zIndex: 60,
                    }}
                  >
                    <div
                      style={{
                        backgroundColor: '#2563eb',
                        color: '#ffffff',
                        fontSize: 20,
                        fontWeight: 900,
                        padding: '12px 22px',
                        borderRadius: 18,
                        border: '4px solid #0f172a',
                        boxShadow: '6px 6px 0px #0f172a',
                        whiteSpace: 'nowrap',
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                      }}
                    >
                      2. SELECT TRADELOG
                    </div>
                    {/* Oversized Comic Arrow Head Pointing Right */}
                    <svg width="45" height="45" viewBox="0 0 45 45" fill="none">
                      <path d="M45 22.5L0 42.2776V2.72241L45 22.5Z" fill="#2563eb" stroke="#0f172a" strokeWidth="4" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}

                {/* Animated Dropdown Menu Options */}
                {frame >= 95 && frame < 155 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '105%',
                      left: 0,
                      right: 0,
                      backgroundColor: '#ffffff',
                      border: '3px solid #2563eb',
                      borderRadius: 14,
                      boxShadow: '8px 8px 0px #0f172a',
                      zIndex: 50,
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ padding: '12px 18px', color: '#64748b', fontSize: 16 }}>Quicken Web Connect</div>
                    <div style={{ padding: '12px 18px', color: '#64748b', fontSize: 16 }}>GainsKeeper</div>
                    <div
                      style={{
                        padding: '14px 18px',
                        backgroundColor: '#2563eb',
                        color: '#ffffff',
                        fontWeight: 900,
                        fontSize: 20,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>TradeLog</span>
                      <span style={{ fontSize: 16, fontWeight: 900 }}>✓ SELECT</span>
                    </div>
                    <div style={{ padding: '12px 18px', color: '#64748b', fontSize: 16 }}>MS Money</div>
                  </div>
                )}
              </div>

              {/* Period Field */}
              <div style={{ marginBottom: 28 }}>
                <label style={{ display: 'block', color: '#475569', fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
                  Period
                </label>
                <div
                  style={{
                    border: '2px solid #cbd5e1',
                    borderRadius: 12,
                    padding: '12px 18px',
                    backgroundColor: '#f8fafc',
                    fontSize: 16,
                    color: '#334155',
                    fontWeight: 700,
                  }}
                >
                  Daily
                </div>
              </div>

              {/* Step 3: Prominent Download Button */}
              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    backgroundColor: frame >= 165 ? '#16a34a' : '#2563eb',
                    color: '#ffffff',
                    borderRadius: 14,
                    padding: '18px',
                    textAlign: 'center',
                    fontSize: 22,
                    fontWeight: 900,
                    border: '3px solid #0f172a',
                    boxShadow: frame >= 165 ? '0 0 0 6px rgba(22,163,74,0.3), 6px 6px 0px #0f172a' : '4px 4px 0px #0f172a',
                    transform: frame >= 165 && frame < 185 ? 'scale(1.04)' : 'scale(1)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {frame >= 165 ? '✓ DOWNLOADING TRADELOG FILE' : 'DOWNLOAD'}
                </div>

                {/* OVERSIZED COMIC POINTER 3 (Left side pointing right) */}
                {frame >= 150 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -6,
                      left: -295 + comicBounce,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      opacity: interpolate(step3, [0, 1], [0, 1]),
                      transform: `scale(${comicScale})`,
                      zIndex: 60,
                    }}
                  >
                    <div
                      style={{
                        backgroundColor: '#16a34a',
                        color: '#ffffff',
                        fontSize: 20,
                        fontWeight: 900,
                        padding: '12px 22px',
                        borderRadius: 18,
                        border: '4px solid #0f172a',
                        boxShadow: '6px 6px 0px #0f172a',
                        whiteSpace: 'nowrap',
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                      }}
                    >
                      3. CLICK DOWNLOAD
                    </div>
                    {/* Oversized Comic Arrow Head Pointing Right */}
                    <svg width="45" height="45" viewBox="0 0 45 45" fill="none">
                      <path d="M45 22.5L0 42.2776V2.72241L45 22.5Z" fill="#16a34a" stroke="#0f172a" strokeWidth="4" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Step Banner at Bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 95,
          left: 60,
          right: 60,
          backgroundColor: '#ffffff',
          border: '4px solid #0f172a',
          borderRadius: 22,
          padding: '20px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '8px 8px 0px #0f172a',
          zIndex: 40,
        }}
      >
        {frame < 85 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: '#2563eb', color: '#fff', border: '3px solid #0f172a', display: 'flex', alignItems: 'center', justify: 'center', fontWeight: 900, fontSize: 24 }}>1</div>
            <div>
              <div style={{ color: '#0f172a', fontSize: 26, fontWeight: 900 }}>Performance & Reports $\rightarrow$ Third-Party Reports</div>
              <div style={{ color: '#475569', fontSize: 18, fontWeight: 700 }}>Open Third-Party Reports tab in IBKR portal</div>
            </div>
          </div>
        )}

        {frame >= 85 && frame < 165 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: '#2563eb', color: '#fff', border: '3px solid #0f172a', display: 'flex', alignItems: 'center', justify: 'center', fontWeight: 900, fontSize: 24 }}>2</div>
            <div>
              <div style={{ color: '#0f172a', fontSize: 26, fontWeight: 900 }}>Select Provider: TradeLog</div>
              <div style={{ color: '#475569', fontSize: 18, fontWeight: 700 }}>Under "Third-Party Downloads", select TradeLog</div>
            </div>
          </div>
        )}

        {frame >= 165 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: '#16a34a', color: '#fff', border: '3px solid #0f172a', display: 'flex', alignItems: 'center', justify: 'center', fontWeight: 900, fontSize: 24 }}>3</div>
            <div>
              <div style={{ color: '#0f172a', fontSize: 26, fontWeight: 900 }}>Click Download & Drop File</div>
              <div style={{ color: '#16a34a', fontSize: 18, fontWeight: 900 }}>Drop file into Trading Diary for instant auto-parse!</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer watermark */}
      <div
        style={{
          position: 'absolute',
          bottom: 36,
          width: '100%',
          textAlign: 'center',
          color: videoTheme.muted,
          fontSize: 20,
          fontWeight: 800,
          letterSpacing: 2,
        }}
      >
        TRADING DIARY — IBKR TRADELOG TUTORIAL
      </div>
    </AbsoluteFill>
  );
}

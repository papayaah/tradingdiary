import type { ReactNode } from 'react';
import {
  AbsoluteFill,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const COLORS = {
  ink: '#111827',
  muted: '#64748b',
  line: '#dbe2ea',
  surface: '#ffffff',
  canvas: '#eef3f8',
  blue: '#075cc9',
  purple: '#a238c7',
  green: '#0f9f6e',
  red: '#d61f2c',
} as const;

const PROMPT =
  'Create an Activity Trades report with account ID, symbol, asset class, buy/sell, quantity, trade price, date/time, currency, commission, exchange, transaction ID, trade ID and multiplier.';

function Scene({
  step,
  title,
  subtitle,
  children,
}: {
  step: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 150 } });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 88% 8%, rgba(7,92,201,.16), transparent 30%), ${COLORS.canvas}`,
        fontFamily: 'Inter, SF Pro Display, Helvetica, Arial, sans-serif',
        padding: '48px 58px 42px',
        opacity: interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' }),
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          transform: `translateY(${interpolate(enter, [0, 1], [18, 0])}px)`,
        }}
      >
        <div>
          <div
            style={{
              color: COLORS.blue,
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: 2.2,
              textTransform: 'uppercase',
            }}
          >
            {step}
          </div>
          <div style={{ color: COLORS.ink, fontSize: 48, fontWeight: 900, marginTop: 5 }}>
            {title}
          </div>
          <div style={{ color: COLORS.muted, fontSize: 22, fontWeight: 600, marginTop: 5 }}>
            {subtitle}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <OwlMark />
          <div style={{ color: COLORS.ink, fontSize: 24, fontWeight: 900 }}>Trading Diary</div>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          marginTop: 30,
          transform: `scale(${interpolate(enter, [0, 1], [0.975, 1])})`,
          transformOrigin: 'center top',
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
}

function OwlMark() {
  return (
    <svg width="48" height="48" viewBox="0 0 64 64">
      <path d="M6 9c10 5 18 5 26 0 8 5 16 5 26 0-1 9-4 15-8 19 3 5 4 10 4 15 0 10-9 16-22 16S10 53 10 43c0-5 1-10 4-15-4-4-7-10-8-19Z" fill="#183b72" />
      <circle cx="23" cy="35" r="11" fill="#fff" />
      <circle cx="41" cy="35" r="11" fill="#fff" />
      <rect x="21" y="28" width="4" height="14" rx="2" fill="#20b86a" />
      <rect x="39" y="28" width="4" height="14" rx="2" fill="#d93443" />
      <path d="m28 43 4 7 4-7Z" fill="#fff" />
    </svg>
  );
}

function PortalWindow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        height: 770,
        overflow: 'hidden',
        border: `2px solid ${COLORS.ink}`,
        borderRadius: 18,
        background: COLORS.surface,
        boxShadow: '0 24px 65px rgba(15,23,42,.18)',
      }}
    >
      <div
        style={{
          height: 72,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          borderBottom: `1px solid ${COLORS.line}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ color: COLORS.red, fontSize: 31, fontWeight: 1000 }}>◢</div>
          <div style={{ color: COLORS.ink, fontSize: 25, fontWeight: 900 }}>InteractiveBrokers</div>
        </div>
        <div style={{ display: 'flex', gap: 42, color: COLORS.ink, fontSize: 16, fontWeight: 700 }}>
          <span>Portfolio</span>
          <span>Trade</span>
          <span>Research</span>
          <span style={{ color: COLORS.blue }}>Performance &amp; Reports</span>
          <span>Education</span>
        </div>
      </div>
      <div
        style={{
          height: 52,
          display: 'flex',
          alignItems: 'center',
          gap: 28,
          padding: '0 30px',
          borderBottom: `1px solid ${COLORS.line}`,
          color: COLORS.muted,
          fontSize: 15,
          fontWeight: 700,
        }}
      >
        <span>Statements</span>
        <span style={{ color: COLORS.ink, borderBottom: `3px solid ${COLORS.blue}`, padding: '16px 3px' }}>
          Flex Queries
        </span>
        <span>Other Reports</span>
        <span>Tax Documents</span>
        <span>Third-Party Reports</span>
        <span>Transaction History</span>
      </div>
      {children}
    </div>
  );
}

function SvgPencil({ color = COLORS.blue, size = 17 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function SvgCross({ color = COLORS.blue, size = 16 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SvgRun({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="11" fill={COLORS.blue} />
      <polygon points="9.5,7.5 16.5,12 9.5,16.5" fill="#ffffff" />
    </svg>
  );
}

function SvgCheck({ color = COLORS.ink, size = 16 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SvgSparkles({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z" />
    </svg>
  );
}

function SvgChevronDown({ color = COLORS.ink, size = 16 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function SvgSearch({ color = '#94a3b8', size = 16 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function SvgArrowRight({ color = '#ffffff', size = 18 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function Callout({ children, color = COLORS.blue }: { children: ReactNode; color?: string }) {
  const frame = useCurrentFrame();
  const pulse = 1 + Math.sin(frame / 5) * 0.025;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        border: `3px solid ${COLORS.ink}`,
        background: color,
        color: '#fff',
        padding: '11px 18px',
        borderRadius: 12,
        boxShadow: `6px 6px 0 ${COLORS.ink}`,
        fontSize: 18,
        fontWeight: 900,
        transform: `scale(${pulse})`,
      }}
    >
      <SvgArrowRight color="#fff" size={18} />
      {children}
    </div>
  );
}

function IntroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 120 } });
  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(circle at 50% 20%, #244a82, #07111f 68%)',
        fontFamily: 'Inter, SF Pro Display, Helvetica, Arial, sans-serif',
        color: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
      }}
    >
      <div style={{ transform: `translateY(${interpolate(enter, [0, 1], [30, 0])}px) scale(${interpolate(enter, [0, 1], [.94, 1])})` }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14 }}>
          <OwlMark />
          <span style={{ fontSize: 28, fontWeight: 900 }}>Trading Diary</span>
        </div>
        <div style={{ marginTop: 30, color: '#93c5fd', fontSize: 22, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase' }}>
          IBKR Flex Web Service
        </div>
        <div style={{ fontSize: 68, lineHeight: 1.05, fontWeight: 950, marginTop: 12 }}>
          Automatic trade imports.
          <br />
          No downloads.
        </div>
        <div style={{ marginTop: 25, color: '#cbd5e1', fontSize: 25, fontWeight: 600 }}>
          Configure the report, copy two values, and connect.
        </div>
      </div>
    </AbsoluteFill>
  );
}

function AiPromptScene() {
  return (
    <Scene step="Step 1 of 5" title="Create the report with AI" subtitle="Performance & Reports → Flex Queries → Configure with AI">
      <PortalWindow>
        <div style={{ padding: 30, display: 'grid', gridTemplateColumns: '1fr 560px', gap: 26, background: '#f8fafc', height: '100%' }}>
          <div style={{ border: `1px solid ${COLORS.line}`, background: '#fff', borderRadius: 12, padding: 28 }}>
            <div style={{ fontSize: 25, fontWeight: 900, color: COLORS.ink }}>Configure with AI</div>
            <div style={{ marginTop: 12, fontSize: 18, color: COLORS.muted }}>IBKR creates the Trades section from your description.</div>
            <div style={{ marginTop: 35, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
              {['Account ID & Symbol', 'Buy/Sell & Quantity', 'Trade Price & Date/Time', 'Commission & Currency', 'Transaction & Trade IDs', 'CSV Column Headers'].map((label) => (
                <div key={label} style={{ padding: '16px 18px', border: `1px solid ${COLORS.line}`, borderRadius: 10, fontSize: 15, fontWeight: 800, color: COLORS.ink, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SvgCheck color={COLORS.green} size={16} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ position: 'relative', border: `3px solid ${COLORS.purple}`, background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 0 0 8px rgba(162,56,199,.12)' }}>
            <div style={{ color: COLORS.ink, fontSize: 20, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
              <SvgSparkles size={20} /> Configure Query with AI
            </div>
            <div style={{ marginTop: 18, minHeight: 180, padding: 18, border: `1px solid ${COLORS.line}`, borderRadius: 8, background: '#faf5ff', color: COLORS.ink, fontSize: 16, lineHeight: 1.45, fontWeight: 600 }}>
              {PROMPT}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, color: COLORS.muted, fontSize: 14, fontWeight: 700 }}>
              <span>Use Trading Diary’s Copy prompt button</span>
              <span>{PROMPT.length}/200</span>
            </div>
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Callout color={COLORS.purple}>Paste prompt into IBKR</Callout>
              <span style={{ display: 'inline-block', background: COLORS.purple, color: '#fff', padding: '12px 24px', borderRadius: 8, fontWeight: 900, fontSize: 16 }}>Generate Flex Query</span>
            </div>
          </div>
        </div>
      </PortalWindow>
    </Scene>
  );
}

function PeriodScene() {
  return (
    <Scene step="Step 2 of 5" title="Choose one year of history" subtitle="Set Period to Last 365 Calendar Days and format to CSV">
      <PortalWindow>
        <div style={{ padding: 30, background: '#f8fafc', height: '100%', display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 28 }}>
          <div style={{ border: `1px solid ${COLORS.line}`, background: '#fff', padding: 28, borderRadius: 12 }}>
            <div style={{ color: COLORS.ink, fontSize: 24, fontWeight: 900 }}>Trades · Execution Fields</div>
            <div style={{ color: COLORS.muted, fontSize: 16, fontWeight: 600, marginTop: 6 }}>13 fields configured automatically</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 20 }}>
              {['Account ID', 'Symbol', 'Asset Class', 'Buy/Sell', 'Quantity', 'TradePrice', 'Date/Time', 'Currency', 'Commission', 'Exchange', 'Transaction ID', 'Trade ID', 'Multiplier'].map((field) => (
                <span key={field} style={{ background: '#eef2f7', color: COLORS.ink, borderRadius: 7, padding: '10px 14px', fontSize: 15, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <SvgCheck color={COLORS.green} size={14} />
                  <span>{field}</span>
                </span>
              ))}
            </div>
          </div>

          <div style={{ position: 'relative', border: `3px solid ${COLORS.blue}`, background: '#fff', padding: 28, borderRadius: 12, boxShadow: '0 0 0 8px rgba(7,92,201,.12)' }}>
            <div style={{ color: COLORS.ink, fontSize: 23, fontWeight: 900 }}>Delivery Configuration</div>
            <Field label="Format" value="CSV" />
            <Field label="Include column headers?" value="Yes" />
            
            <div style={{ marginTop: 22 }}>
              <div style={{ color: COLORS.ink, fontSize: 16, fontWeight: 900, marginBottom: 8 }}>
                Period (Reporting Range)
              </div>
              <div
                style={{
                  border: `3px solid ${COLORS.blue}`,
                  background: '#eff6ff',
                  borderRadius: 8,
                  padding: '14px 18px',
                  color: COLORS.blue,
                  fontSize: 18,
                  fontWeight: 900,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 0 0 6px rgba(7,92,201,0.1)',
                }}
              >
                <span>Last 365 Calendar Days</span>
                <SvgChevronDown color={COLORS.blue} size={20} />
              </div>
            </div>

            <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Callout color={COLORS.blue}>Select "Last 365 Days"</Callout>
              <div
                style={{
                  background: COLORS.blue,
                  color: '#fff',
                  padding: '12px 24px',
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 900,
                }}
              >
                Save Changes
              </div>
            </div>
          </div>
        </div>
      </PortalWindow>
    </Scene>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ color: COLORS.muted, fontSize: 14, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 4, color: COLORS.ink, fontSize: 17, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function MousePointerIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.35))' }}>
      <path
        d="M4 2l6 17 3-6 6-3L4 2z"
        fill="#111827"
        stroke="#ffffff"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function QueryIdScene() {
  const frame = useCurrentFrame();
  const isEditing = frame > 48;

  const cursorX = interpolate(frame, [0, 25, 45], [1100, 1530, 1530], { extrapolateRight: 'clamp' });
  const cursorY = interpolate(frame, [0, 25, 45], [520, 266, 266], { extrapolateRight: 'clamp' });
  const isClicking = frame >= 42 && frame <= 48;

  return (
    <Scene
      step="Step 3 of 5"
      title={isEditing ? 'Copy your numeric Query ID' : 'Click Edit on your Trade Details Report'}
      subtitle={
        isEditing
          ? 'The Query ID is right at the top under Activity Flex Query Details'
          : 'Click the pencil icon next to Trade Details Report to open query details'
      }
    >
      <PortalWindow>
        {!isEditing ? (
          <div style={{ position: 'relative', padding: '24px 32px', background: '#f8fafc', height: '100%' }}>
            {/* Configure with AI banner */}
            <div
              style={{
                border: `1px solid ${COLORS.line}`,
                background: '#fff',
                borderRadius: 10,
                padding: '16px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 20,
              }}
            >
              <div>
                <div style={{ fontSize: 18, fontWeight: 850, color: COLORS.ink }}>Configure with AI</div>
                <div style={{ fontSize: 14, color: COLORS.muted, marginTop: 3 }}>
                  Describe the report you need and AI will create a Flex Query for you.
                </div>
              </div>
              <div
                style={{
                  background: COLORS.purple,
                  color: '#fff',
                  padding: '9px 18px',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <SvgSparkles size={16} /> Configure with AI
              </div>
            </div>

            {/* Activity Flex Query table */}
            <div style={{ border: `1px solid ${COLORS.line}`, background: '#fff', borderRadius: 10, overflow: 'hidden' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '18px 24px',
                  borderBottom: `1px solid ${COLORS.line}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: COLORS.ink, fontSize: 20, fontWeight: 900 }}>Activity Flex Query</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      border: `1px solid ${COLORS.line}`,
                      borderRadius: 6,
                      background: '#fff',
                      height: 38,
                      width: 250,
                      padding: '0 12px',
                    }}
                  >
                    <span style={{ color: COLORS.muted, fontSize: 14, flex: 1 }}>Search</span>
                    <span style={{ display: 'grid', placeItems: 'center', marginRight: 8 }}><SvgCross color="#94a3b8" size={13} /></span>
                    <span style={{ display: 'grid', placeItems: 'center' }}><SvgSearch color="#94a3b8" size={16} /></span>
                  </div>
                  <span style={{ color: COLORS.blue, fontSize: 24, fontWeight: 900, cursor: 'pointer' }}>+</span>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: COLORS.blue,
                      color: '#fff',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 13,
                      fontWeight: 900,
                    }}
                  >
                    ?
                  </span>
                </div>
              </div>

              <div>
                <QueryTableRow label="Profit and Loss" />
                <QueryTableRow label="Trade Details Report" active showEditTooltip={frame >= 18} />
              </div>
            </div>

            {/* Animated mouse cursor pointing at Edit */}
            <div
              style={{
                position: 'absolute',
                left: cursorX,
                top: cursorY,
                transform: `scale(${isClicking ? 0.85 : 1})`,
                transition: 'transform 0.1s ease',
                pointerEvents: 'none',
                zIndex: 50,
              }}
            >
              <MousePointerIcon />
            </div>

            {/* Callout box pointing directly to the pencil with generous spacing */}
            <div style={{ position: 'absolute', right: 320, top: 246 }}>
              <Callout color={COLORS.blue}>Click Edit pencil icon</Callout>
            </div>
          </div>
        ) : (
          <div style={{ position: 'relative', padding: '28px 36px', background: '#fff', height: '100%' }}>
            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: COLORS.muted, fontWeight: 700 }}>
              <span style={{ color: COLORS.blue }}>Flex Queries</span>
              <span>/</span>
              <span>Trade Details Report</span>
            </div>

            {/* Title with Account Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
              <h2 style={{ color: COLORS.ink, fontSize: 32, fontWeight: 950, margin: 0 }}>Trade Details Report</h2>
              <span
                style={{
                  background: '#3b82f6',
                  color: '#fff',
                  borderRadius: 16,
                  padding: '4px 14px',
                  fontSize: 14,
                  fontWeight: 900,
                }}
              >
                U1137487
              </span>
            </div>

            {/* Section Header */}
            <div style={{ marginTop: 32, fontSize: 20, fontWeight: 900, color: COLORS.ink }}>
              Activity Flex Query Details
            </div>

            {/* Query ID and Query Name rows matching screenshot */}
            <div style={{ marginTop: 20, maxWidth: 900 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '180px 1fr',
                  alignItems: 'center',
                  padding: '16px 20px',
                  border: `3px solid ${COLORS.blue}`,
                  borderRadius: 10,
                  background: '#eff6ff',
                  boxShadow: '0 0 0 8px rgba(7,92,201,.12)',
                }}
              >
                <span style={{ color: COLORS.ink, fontSize: 18, fontWeight: 800 }}>Query ID</span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: COLORS.blue, fontSize: 30, fontWeight: 950, letterSpacing: 2 }}>1609333</span>
                  <span
                    style={{
                      background: COLORS.blue,
                      color: '#fff',
                      borderRadius: 6,
                      padding: '6px 14px',
                      fontSize: 14,
                      fontWeight: 800,
                    }}
                  >
                    Copy this number
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '180px 1fr',
                  alignItems: 'center',
                  marginTop: 18,
                  padding: '0 4px',
                }}
              >
                <span style={{ color: COLORS.ink, fontSize: 17, fontWeight: 700 }}>Query Name</span>
                <div
                  style={{
                    border: `1px solid ${COLORS.line}`,
                    borderRadius: 6,
                    padding: '12px 16px',
                    fontSize: 17,
                    fontWeight: 700,
                    color: COLORS.ink,
                    background: '#fff',
                  }}
                >
                  Trade Details Report
                </div>
              </div>

              {/* Sections (Select Multiple) preview */}
              <div style={{ marginTop: 24, padding: '0 4px' }}>
                <div style={{ color: COLORS.ink, fontSize: 16, fontWeight: 800, marginBottom: 12 }}>
                  Sections (Select Multiple)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {['Account Information', 'Interest Accruals', 'Borrow Fee Details', 'Trades'].map((sec) => {
                    const isTrades = sec === 'Trades';
                    return (
                      <div
                        key={sec}
                        style={{
                          border: `1px solid ${isTrades ? COLORS.blue : COLORS.line}`,
                          background: isTrades ? '#eff6ff' : '#fff',
                          color: isTrades ? COLORS.blue : COLORS.ink,
                          borderRadius: 8,
                          padding: '12px 18px',
                          fontSize: 15,
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        {isTrades && <SvgCheck color={COLORS.blue} size={16} />}
                        <span>{sec}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Callout */}
            <div style={{ position: 'absolute', right: 80, top: 160 }}>
              <Callout color={COLORS.blue}>Paste this Query ID into Trading Diary</Callout>
            </div>
          </div>
        )}
      </PortalWindow>
    </Scene>
  );
}

function QueryTableRow({
  label,
  active = false,
  showEditTooltip = false,
}: {
  label: string;
  active?: boolean;
  showEditTooltip?: boolean;
}) {
  return (
    <div
      style={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        borderBottom: `1px solid ${COLORS.line}`,
        background: active ? '#f8fafc' : '#fff',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span
          style={{
            width: 26,
            height: 26,
            display: 'grid',
            placeItems: 'center',
            borderRadius: '50%',
            color: '#fff',
            background: COLORS.blue,
            fontSize: 14,
            fontWeight: 900,
          }}
        >
          i
        </span>
        <span style={{ color: COLORS.ink, fontSize: 18, fontWeight: 800 }}>{label}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* Edit Button with attached tooltip cleanly to its left */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          {showEditTooltip && (
            <div
              style={{
                position: 'absolute',
                right: '100%',
                marginRight: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                background: '#1e293b',
                color: '#fff',
                padding: '6px 12px',
                borderRadius: 4,
                fontSize: 14,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                whiteSpace: 'nowrap',
                zIndex: 10,
              }}
            >
              Edit
              <span
                style={{
                  position: 'absolute',
                  right: -6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 0,
                  height: 0,
                  borderTop: '6px solid transparent',
                  borderBottom: '6px solid transparent',
                  borderLeft: '6px solid #1e293b',
                }}
              />
            </div>
          )}

          {/* Edit Pencil Icon */}
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              border: active ? `2px solid ${COLORS.blue}` : '1px solid transparent',
              background: active ? '#eff6ff' : 'transparent',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <SvgPencil color={COLORS.blue} size={18} />
          </div>
        </div>

        {/* Delete Icon */}
        <div style={{ display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <SvgCross color={COLORS.blue} size={17} />
        </div>

        {/* Run Icon */}
        <div style={{ display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <SvgRun size={24} />
        </div>
      </div>
    </div>
  );
}

function TokenScene() {
  return (
    <Scene step="Step 4 of 5" title="Enable Flex Web Service" subtitle="Generate a token, then keep it private">
      <PortalWindow>
        <div style={{ padding: 36, background: '#f8fafc', height: '100%' }}>
          <div style={{ maxWidth: 1160, margin: '0 auto', background: '#fff', border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 32 }}>
            <div style={{ color: COLORS.ink, fontSize: 28, fontWeight: 900 }}>Configure Flex Web Service</div>
            <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 13, color: COLORS.ink, fontSize: 20, fontWeight: 800 }}>
              <span style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', color: '#fff', background: COLORS.blue, borderRadius: 4 }}>
                <SvgCheck color="#fff" size={18} />
              </span>
              Flex Web Service Status: Enabled
            </div>
            <div style={{ marginTop: 30, paddingTop: 25, borderTop: `1px solid ${COLORS.line}` }}>
              <div style={{ color: COLORS.ink, fontSize: 21, fontWeight: 900 }}>Current Token</div>
              <div style={{ marginTop: 15, padding: 20, border: `3px solid ${COLORS.green}`, background: '#ecfdf5', borderRadius: 10, color: COLORS.ink, fontSize: 26, fontWeight: 900, letterSpacing: 5 }}>
                ••••••••••••••••••••••••
              </div>
            </div>
            <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: COLORS.muted, fontSize: 17, fontWeight: 700 }}>Choose an activation period, generate the token, then Save.</span>
              <span style={{ padding: '15px 24px', background: COLORS.blue, color: '#fff', borderRadius: 8, fontSize: 18, fontWeight: 900 }}>Generate New Token</span>
            </div>
          </div>
          <div style={{ marginTop: 28, display: 'flex', justifyContent: 'center' }}>
            <Callout color={COLORS.green}>Never show or share this token</Callout>
          </div>
        </div>
      </PortalWindow>
    </Scene>
  );
}

function ConnectScene() {
  const frame = useCurrentFrame();
  const connected = frame > 50;
  return (
    <Scene step="Step 5 of 5" title="Connect it in Trading Diary" subtitle="Credentials remain server-side; your browser reads the synced cache">
      <div style={{ height: 770, display: 'grid', gridTemplateColumns: '1fr 440px', gap: 30 }}>
        <div style={{ background: '#fff', border: `2px solid ${COLORS.ink}`, borderRadius: 18, padding: 38, boxShadow: '0 24px 65px rgba(15,23,42,.16)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}><OwlMark /><div style={{ color: COLORS.ink, fontSize: 28, fontWeight: 900 }}>IBKR Flex connection</div></div>
          <div style={{ marginTop: 30, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
            <ConnectField label="Query ID" value="1609333" />
            <ConnectField label="Flex Web Service token" value="••••••••••••••••••••••••" />
          </div>
          <div style={{ marginTop: 24, padding: 18, background: '#f8fafc', border: `1px solid ${COLORS.line}`, color: COLORS.muted, fontSize: 17, fontWeight: 700 }}>
            Automatic sync uses IBKR’s endpoint. No file download is required.
          </div>
          <div style={{ marginTop: 30, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ background: connected ? COLORS.green : COLORS.blue, color: '#fff', padding: '16px 28px', borderRadius: 8, fontSize: 19, fontWeight: 900, boxShadow: connected ? '0 0 0 8px rgba(15,159,110,.13)' : undefined, display: 'flex', alignItems: 'center', gap: 8 }}>
              {connected && <SvgCheck color="#fff" size={18} />}
              {connected ? 'Connected and synced' : 'Test connection'}
            </div>
          </div>
        </div>
        <div style={{ background: '#0f172a', borderRadius: 18, padding: 34, color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ color: '#93c5fd', fontSize: 18, fontWeight: 900, letterSpacing: 2 }}>YOU’RE DONE</div>
          <div style={{ fontSize: 38, lineHeight: 1.12, fontWeight: 950, marginTop: 15 }}>Stocks and futures sync automatically.</div>
          <div style={{ color: '#cbd5e1', fontSize: 20, lineHeight: 1.5, fontWeight: 600, marginTop: 22 }}>Trading Diary imports executions, ignores duplicates, and serves them from the centralized backend.</div>
        </div>
      </div>
    </Scene>
  );
}

function ConnectField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: COLORS.ink, fontSize: 16, fontWeight: 900, marginBottom: 8 }}>{label}</div>
      <div style={{ border: `2px solid ${COLORS.line}`, padding: '16px 18px', color: COLORS.ink, fontSize: 20, fontWeight: 800, letterSpacing: label.includes('token') ? 3 : 1 }}>{value}</div>
    </div>
  );
}

export function IBKRFlexGuidePromo() {
  return (
    <AbsoluteFill style={{ background: COLORS.canvas }}>
      <Sequence durationInFrames={90}><IntroScene /></Sequence>
      <Sequence from={90} durationInFrames={120}><AiPromptScene /></Sequence>
      <Sequence from={210} durationInFrames={120}><PeriodScene /></Sequence>
      <Sequence from={330} durationInFrames={130}><QueryIdScene /></Sequence>
      <Sequence from={460} durationInFrames={115}><TokenScene /></Sequence>
      <Sequence from={575} durationInFrames={145}><ConnectScene /></Sequence>
    </AbsoluteFill>
  );
}

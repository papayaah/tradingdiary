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
          gap: 34,
          padding: '0 30px',
          borderBottom: `1px solid ${COLORS.line}`,
          color: COLORS.muted,
          fontSize: 16,
          fontWeight: 700,
        }}
      >
        <span>Statements</span>
        <span style={{ color: COLORS.ink, borderBottom: `3px solid ${COLORS.blue}`, padding: '16px 3px' }}>
          Flex Queries
        </span>
        <span>Other Reports</span>
        <span>Tax Documents</span>
      </div>
      {children}
    </div>
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
      <span style={{ fontSize: 21 }}>➜</span>
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
        <div style={{ padding: 30, display: 'grid', gridTemplateColumns: '1fr 520px', gap: 26, background: '#f8fafc', height: '100%' }}>
          <div style={{ border: `1px solid ${COLORS.line}`, background: '#fff', borderRadius: 12, padding: 28 }}>
            <div style={{ fontSize: 25, fontWeight: 900, color: COLORS.ink }}>Configure with AI</div>
            <div style={{ marginTop: 12, fontSize: 18, color: COLORS.muted }}>IBKR creates the Trades section from your description.</div>
            <div style={{ marginTop: 45, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {['Trades', 'Executions', 'CSV headers', 'Trade IDs', 'Commission', 'Currency'].map((label) => (
                <div key={label} style={{ padding: 18, border: `1px solid ${COLORS.line}`, borderRadius: 10, fontSize: 16, fontWeight: 800, color: COLORS.ink }}>✓ {label}</div>
              ))}
            </div>
          </div>
          <div style={{ position: 'relative', border: `3px solid ${COLORS.purple}`, background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 0 0 8px rgba(162,56,199,.12)' }}>
            <div style={{ color: COLORS.ink, fontSize: 20, fontWeight: 900 }}>✦ Configure Query with AI</div>
            <div style={{ marginTop: 20, minHeight: 210, padding: 18, border: `1px solid ${COLORS.line}`, color: COLORS.ink, fontSize: 17, lineHeight: 1.45 }}>
              {PROMPT}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, color: COLORS.muted, fontSize: 14, fontWeight: 700 }}>
              <span>Use Trading Diary’s Copy prompt button</span>
              <span>{PROMPT.length}/200</span>
            </div>
            <div style={{ marginTop: 30, textAlign: 'right' }}>
              <span style={{ display: 'inline-block', background: COLORS.purple, color: '#fff', padding: '14px 28px', borderRadius: 8, fontWeight: 900 }}>Generate Flex Query</span>
            </div>
            <div style={{ position: 'absolute', left: -235, bottom: 82 }}><Callout color={COLORS.purple}>Paste this prompt</Callout></div>
          </div>
        </div>
      </PortalWindow>
    </Scene>
  );
}

function PeriodScene() {
  return (
    <Scene step="Step 2 of 5" title="Choose one year of history" subtitle="Use CSV with column headers and a rolling historical period">
      <PortalWindow>
        <div style={{ padding: 34, background: '#f8fafc', height: '100%', display: 'grid', gridTemplateColumns: '1.25fr .75fr', gap: 28 }}>
          <div style={{ border: `1px solid ${COLORS.line}`, background: '#fff', padding: 28, borderRadius: 12 }}>
            <div style={{ color: COLORS.ink, fontSize: 24, fontWeight: 900 }}>Trades · Execution</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 22 }}>
              {['Account ID', 'Symbol', 'Asset Class', 'Buy/Sell', 'Quantity', 'TradePrice', 'Date/Time', 'Currency', 'Commission', 'Exchange', 'Transaction ID', 'Trade ID', 'Multiplier'].map((field) => (
                <span key={field} style={{ background: '#eef2f7', color: COLORS.ink, borderRadius: 7, padding: '10px 13px', fontSize: 15, fontWeight: 800 }}>{field}</span>
              ))}
            </div>
          </div>
          <div style={{ position: 'relative', border: `3px solid ${COLORS.blue}`, background: '#fff', padding: 28, borderRadius: 12, boxShadow: '0 0 0 8px rgba(7,92,201,.12)' }}>
            <div style={{ color: COLORS.ink, fontSize: 23, fontWeight: 900 }}>Delivery Configuration</div>
            <Field label="Format" value="CSV" />
            <Field label="Include column headers?" value="Yes" />
            <div style={{ marginTop: 20 }}>
              <div style={{ color: COLORS.muted, fontSize: 14, fontWeight: 800, marginBottom: 7 }}>Period</div>
              <div style={{ border: `3px solid ${COLORS.blue}`, background: '#eff6ff', borderRadius: 8, padding: '15px 16px', color: COLORS.ink, fontSize: 19, fontWeight: 900, display: 'flex', justifyContent: 'space-between' }}>
                <span>Last 365 Calendar Days</span><span>▾</span>
              </div>
            </div>
            <div style={{ position: 'absolute', left: -260, bottom: 78 }}><Callout>Set this before saving</Callout></div>
          </div>
        </div>
      </PortalWindow>
    </Scene>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ color: COLORS.muted, fontSize: 14, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 6, color: COLORS.ink, fontSize: 18, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function QueryIdScene() {
  const frame = useCurrentFrame();
  const open = frame > 58;
  return (
    <Scene step="Step 3 of 5" title="Click the blue information icon" subtitle="The Query ID is inside the Trade Details Report panel">
      <PortalWindow>
        <div style={{ position: 'relative', padding: 32, background: '#f8fafc', height: '100%' }}>
          <div style={{ border: `1px solid ${COLORS.line}`, background: '#fff', borderRadius: 12, padding: 26 }}>
            <div style={{ color: COLORS.ink, fontSize: 24, fontWeight: 900 }}>Activity Flex Query</div>
            <div style={{ marginTop: 28, borderTop: `1px solid ${COLORS.line}` }}>
              <QueryRow label="Profit and Loss" />
              <QueryRow label="Trade Details Report" active />
            </div>
          </div>
          {!open ? (
            <div style={{ position: 'absolute', left: 146, top: 300 }}><Callout>Click this ⓘ icon</Callout></div>
          ) : (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center' }}>
              <div style={{ width: 960, background: '#fff', borderRadius: 14, border: `2px solid ${COLORS.ink}`, boxShadow: '0 25px 75px rgba(0,0,0,.28)', padding: 30 }}>
                <div style={{ color: COLORS.ink, fontSize: 28, fontWeight: 900, paddingBottom: 18, borderBottom: `1px solid ${COLORS.line}` }}>Trade Details Report</div>
                <div style={{ marginTop: 25, fontSize: 20, fontWeight: 900, color: COLORS.ink }}>Activity Flex Query Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 18, marginTop: 20, padding: 22, border: `4px solid ${COLORS.blue}`, background: '#eff6ff', borderRadius: 10, boxShadow: '0 0 0 9px rgba(7,92,201,.13)' }}>
                  <span style={{ color: COLORS.ink, fontSize: 20 }}>Query ID</span>
                  <span style={{ color: COLORS.blue, fontSize: 27, fontWeight: 950, letterSpacing: 2 }}>1234567</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 18, marginTop: 18, fontSize: 18 }}>
                  <span>Query Name</span><strong>Trade Details Report</strong>
                </div>
                <div style={{ marginTop: 24, color: COLORS.muted, fontSize: 16, fontWeight: 700 }}>Use your own number. The tutorial displays a safe example.</div>
              </div>
            </div>
          )}
        </div>
      </PortalWindow>
    </Scene>
  );
}

function QueryRow({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div style={{ height: 70, display: 'flex', alignItems: 'center', gap: 20, borderBottom: `1px solid ${COLORS.line}`, color: COLORS.ink, fontSize: 20, fontWeight: 800 }}>
      <span style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: '50%', color: '#fff', background: COLORS.blue, boxShadow: active ? '0 0 0 9px rgba(7,92,201,.18)' : undefined }}>i</span>
      {label}
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
              <span style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', color: '#fff', background: COLORS.blue }}>✓</span>
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
          <div style={{ position: 'absolute', left: 158, bottom: 82 }}><Callout color={COLORS.green}>Never show or share this token</Callout></div>
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
            <ConnectField label="Query ID" value="1234567" />
            <ConnectField label="Flex Web Service token" value="••••••••••••••••••••••••" />
          </div>
          <div style={{ marginTop: 24, padding: 18, background: '#f8fafc', border: `1px solid ${COLORS.line}`, color: COLORS.muted, fontSize: 17, fontWeight: 700 }}>
            Automatic sync uses IBKR’s endpoint. No file download is required.
          </div>
          <div style={{ marginTop: 30, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ background: connected ? COLORS.green : COLORS.blue, color: '#fff', padding: '16px 28px', borderRadius: 8, fontSize: 19, fontWeight: 900, boxShadow: connected ? '0 0 0 8px rgba(15,159,110,.13)' : undefined }}>
              {connected ? '✓ Connected and synced' : 'Test connection'}
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

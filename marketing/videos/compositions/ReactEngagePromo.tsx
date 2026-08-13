import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export function ReactEngagePromo({ themeMode = 'light' }: { themeMode?: 'light' | 'dark' }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Light theme semantic tokens matching react-engage CSS variables
  const colors = {
    bg: '#F8FAFC',
    card: '#FFFFFF',
    border: '#E2E8F0',
    navBg: '#F1F5F9',
    foreground: '#0F172A',
    muted: '#64748B',
    accent: '#2563EB',
    accentSubtle: '#EFF6FF',
    badgeBugBg: '#FEE2E2',
    badgeBugText: '#DC2626',
    badgeSuggBg: '#D1FAE5',
    badgeSuggText: '#059669',
  };

  // Phase transition timeline:
  // Phase 1 (Frame 0 - 80): Floating Widget & User Drawer
  // Phase 2 (Frame 80 - 160): Admin Tab 1 - Support Inbox
  // Phase 3 (Frame 160 - 240): Admin Tab 2 - Audience & Newsletters
  // Phase 4 (Frame 240 - 320): Admin Tab 3 - Email Templates Editor
  const currentTab = frame < 80 ? 'widget' : frame < 160 ? 'inbox' : frame < 240 ? 'newsletter' : 'templates';

  // Smooth springs
  const drawerSpring = spring({ frame: frame - 5, fps, config: { damping: 14, stiffness: 140 } });
  const adminSpring = spring({ frame: Math.max(0, frame - 80), fps, config: { damping: 15, stiffness: 160 } });

  // Widget sub-tabs (0-80)
  const widgetSubTab = frame < 30 ? 'faq' : frame < 55 ? 'feedback' : 'newsletter';

  return (
    <AbsoluteFill
      style={{
        background: colors.bg,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
        color: colors.foreground,
      }}
    >
      {currentTab === 'widget' ? (
        /* PHASE 1: Embedded Floating Widget & Drawer */
        <div style={{ position: 'absolute', inset: 0, padding: 40 }}>
          {/* Main Host App Content Placeholder */}
          <div style={{ opacity: 0.12 }}>
            <div style={{ height: 440, background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 20 }} />
          </div>

          {/* Expanded Drawer (Matching FeedbackDrawer.tsx 100%) */}
          <div
            style={{
              position: 'absolute',
              right: 40,
              bottom: 110,
              width: 440,
              height: 560,
              background: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: 20,
              boxShadow: '0 25px 60px rgba(0,0,0,0.12)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              opacity: drawerSpring,
              transform: `scale(${interpolate(drawerSpring, [0, 1], [0.9, 1])}) translateY(${interpolate(drawerSpring, [0, 1], [30, 0])}px)`,
              transformOrigin: 'bottom right',
            }}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Help & Feedback</div>
              <div style={{ color: colors.muted, fontSize: 18, fontWeight: 700 }}>✕</div>
            </div>

            {/* 3-Tab Nav */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: 8, gap: 6, background: colors.navBg, borderBottom: `1px solid ${colors.border}` }}>
              <div style={{ padding: '8px 0', textAlign: 'center', borderRadius: 8, fontSize: 13, fontWeight: 700, background: widgetSubTab === 'faq' ? colors.card : 'transparent', color: widgetSubTab === 'faq' ? colors.accent : colors.muted }}>
                FAQ
              </div>
              <div style={{ padding: '8px 0', textAlign: 'center', borderRadius: 8, fontSize: 13, fontWeight: 700, background: widgetSubTab === 'feedback' ? colors.card : 'transparent', color: widgetSubTab === 'feedback' ? colors.accent : colors.muted }}>
                Support
              </div>
              <div style={{ padding: '8px 0', textAlign: 'center', borderRadius: 8, fontSize: 13, fontWeight: 700, background: widgetSubTab === 'newsletter' ? colors.card : 'transparent', color: widgetSubTab === 'newsletter' ? colors.accent : colors.muted }}>
                Newsletter
              </div>
            </div>

            {/* Tab Body */}
            <div style={{ padding: 24, flex: 1 }}>
              {widgetSubTab === 'faq' && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: colors.muted, marginBottom: 16 }}>FREQUENTLY ASKED QUESTIONS</div>
                  <div style={{ background: colors.navBg, padding: 14, borderRadius: 12, marginBottom: 10, fontSize: 14, fontWeight: 700 }}>How do I get started with the SDK?</div>
                  <div style={{ background: colors.navBg, padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 700 }}>How do auto-telemetry bug reports work?</div>
                </div>
              )}

              {widgetSubTab === 'feedback' && (
                <div>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                    <span style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 800, background: colors.badgeBugBg, color: colors.badgeBugText }}>Report Bug</span>
                    <span style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 800, background: colors.badgeSuggBg, color: colors.badgeSuggText }}>Suggest Feature</span>
                  </div>
                  <div style={{ background: colors.navBg, border: `1px solid ${colors.border}`, padding: 14, borderRadius: 12, height: 120, fontSize: 13, color: colors.foreground, marginBottom: 16 }}>
                    File export fails when processing large data files...
                  </div>
                  <div style={{ background: colors.accent, color: '#FFF', textAlign: 'center', padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 800 }}>
                    Submit Report
                  </div>
                </div>
              )}

              {widgetSubTab === 'newsletter' && (
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Subscribe to Updates</div>
                  <div style={{ fontSize: 13, color: colors.muted, marginBottom: 20 }}>Receive product digests & feature announcements.</div>
                  <div style={{ background: colors.navBg, border: `1px solid ${colors.border}`, padding: 12, borderRadius: 10, fontSize: 14, marginBottom: 14 }}>
                    alex.user@example.com
                  </div>
                  <div style={{ background: colors.accent, color: '#FFF', textAlign: 'center', padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 800 }}>
                    Subscribe
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Floating Launcher Button */}
          <div
            style={{
              position: 'absolute',
              right: 40,
              bottom: 40,
              background: colors.accent,
              color: '#FFFFFF',
              padding: '14px 24px',
              borderRadius: 999,
              fontSize: 15,
              fontWeight: 800,
              boxShadow: '0 10px 25px rgba(37,99,235,0.3)',
            }}
          >
            Help & Feedback
          </div>
        </div>
      ) : (
        /* PHASE 2, 3, 4: In-App EngageAdminPanel (Showing all 3 main tabs) */
        <div style={{ padding: 24, height: '100%', display: 'flex', flexDirection: 'column', opacity: adminSpring }}>
          {/* Top Admin Navigation Header (Matching EngageAdminPanel.tsx 100%) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 24px',
              borderRadius: 14,
              backgroundColor: colors.card,
              border: `1px solid ${colors.border}`,
              marginBottom: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#10B981' }} />
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: colors.foreground }}>Engage Admin Dashboard</h2>
              <span style={{ fontSize: 11, background: colors.navBg, padding: '2px 8px', borderRadius: 12, color: colors.muted, fontWeight: 600 }}>v0.2.0</span>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: 6, background: colors.navBg, padding: 4, borderRadius: 10 }}>
              <div
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  backgroundColor: currentTab === 'inbox' ? colors.accent : 'transparent',
                  color: currentTab === 'inbox' ? '#FFFFFF' : colors.muted,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                Support Inbox (2)
              </div>
              <div
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  backgroundColor: currentTab === 'newsletter' ? colors.accent : 'transparent',
                  color: currentTab === 'newsletter' ? '#FFFFFF' : colors.muted,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                Audience & Newsletters
              </div>
              <div
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  backgroundColor: currentTab === 'templates' ? colors.accent : 'transparent',
                  color: currentTab === 'templates' ? '#FFFFFF' : colors.muted,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                Email Templates
              </div>
            </div>
          </div>

          {/* ADMIN TAB 1: Support Inbox View */}
          {currentTab === 'inbox' && (
            <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, flex: 1 }}>
              {/* Left Submissions List */}
              <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 16 }}>
                <div style={{ background: colors.navBg, border: `1px solid ${colors.border}`, padding: '10px 14px', borderRadius: 10, fontSize: 13, color: colors.muted, marginBottom: 16, fontWeight: 600 }}>
                  All Submissions
                </div>

                <div style={{ background: colors.navBg, border: `1px solid ${colors.accent}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 900, background: colors.badgeBugBg, color: colors.badgeBugText, padding: '2px 6px', borderRadius: 4 }}>BUG</span>
                    <span style={{ fontSize: 12, color: colors.muted }}>04:10 PM</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>File export fails when processing large files</div>
                  <div style={{ fontSize: 12, color: colors.muted }}>alex.user@example.com</div>
                </div>

                <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 900, background: colors.badgeSuggBg, color: colors.badgeSuggText, padding: '2px 6px', borderRadius: 4 }}>SUGGESTION</span>
                    <span style={{ fontSize: 12, color: colors.muted }}>08:10 AM</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Add custom dashboard reporting tools</div>
                  <div style={{ fontSize: 12, color: colors.muted }}>sarah.dev@example.com</div>
                </div>
              </div>

              {/* Right Ticket Detailed Inspection */}
              <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 22, fontWeight: 900 }}>File export fails when processing large files</div>
                    <span style={{ background: '#F59E0B22', color: '#F59E0B', fontSize: 12, fontWeight: 900, padding: '4px 12px', borderRadius: 8 }}>OPEN</span>
                  </div>
                  <div style={{ fontSize: 13, color: colors.muted, marginBottom: 20 }}>alex.user@example.com • 8/11/2026, 4:10:23 PM</div>

                  {/* Auto-Telemetry Metadata Box */}
                  <div style={{ background: colors.navBg, border: `1px solid ${colors.border}`, padding: 14, borderRadius: 12, display: 'flex', gap: 20, fontSize: 13, marginBottom: 20 }}>
                    <div>URL Path: <span style={{ fontWeight: 700 }}>/export</span></div>
                    <div>Browser: <span style={{ fontWeight: 700 }}>Chrome 124.0</span></div>
                    <div>OS: <span style={{ fontWeight: 700 }}>macOS 14.5</span></div>
                    <div>Screen: <span style={{ fontWeight: 700 }}>2560x1440</span></div>
                  </div>

                  <div style={{ background: colors.navBg, border: `1px solid ${colors.border}`, padding: 18, borderRadius: 12, fontSize: 14, lineHeight: 1.6 }}>
                    When exporting dataset reports over 100MB, the browser times out with a validation error.
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: colors.muted, marginBottom: 8 }}>Reply to User via Email (alex.user@example.com)</div>
                  <div style={{ background: colors.navBg, border: `1px solid ${colors.border}`, padding: 14, borderRadius: 12, fontSize: 14, color: colors.muted }}>
                    Type your reply message here...
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ADMIN TAB 2: Audience & Newsletters View */}
          {currentTab === 'newsletter' && (
            <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 32, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: 10, background: colors.navBg, padding: 4, borderRadius: 10, width: 'fit-content', marginBottom: 24 }}>
                <div style={{ padding: '8px 20px', borderRadius: 8, background: colors.card, color: colors.accent, fontWeight: 800, fontSize: 13, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>Dispatch Broadcast</div>
                <div style={{ padding: '8px 20px', borderRadius: 8, color: colors.muted, fontWeight: 600, fontSize: 13 }}>Subscribers List (1,248)</div>
                <div style={{ padding: '8px 20px', borderRadius: 8, color: colors.muted, fontWeight: 600, fontSize: 13 }}>Sent Broadcast History</div>
              </div>

              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>New Product Announcement</div>
              <div style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Broadcast Subject Line</div>
              <div style={{ background: colors.navBg, border: `1px solid ${colors.border}`, padding: 14, borderRadius: 10, fontSize: 14, fontWeight: 600, marginBottom: 20 }}>
                🚀 What's New in v0.2.0 - Release Digest
              </div>

              <div style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Email HTML / Markdown Body</div>
              <div style={{ background: colors.navBg, border: `1px solid ${colors.border}`, padding: 18, borderRadius: 12, flex: 1, fontSize: 14, color: colors.foreground, lineHeight: 1.6 }}>
                We are excited to launch auto-telemetry bug reporting and newsletter broadcast management in this release!
              </div>
            </div>
          )}

          {/* ADMIN TAB 3: System Email Templates View */}
          {currentTab === 'templates' && (
            <div style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 24, flex: 1, display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24 }}>
              {/* Left Template List */}
              <div style={{ borderRight: `1px solid ${colors.border}`, paddingRight: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: colors.muted, marginBottom: 14 }}>EMAIL TEMPLATES</div>
                <div style={{ padding: '12px 16px', borderRadius: 10, background: colors.accent, color: '#FFF', fontWeight: 800, fontSize: 13, marginBottom: 8 }}>
                  Welcome Email (New Signup)
                </div>
                <div style={{ padding: '12px 16px', borderRadius: 10, background: colors.navBg, color: colors.foreground, fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                  Support Ticket Reply
                </div>
                <div style={{ padding: '12px 16px', borderRadius: 10, background: colors.navBg, color: colors.foreground, fontWeight: 600, fontSize: 13 }}>
                  Newsletter Digest
                </div>
              </div>

              {/* Right Template Code Editor & Live Preview */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>Editing: Welcome Email</div>
                  <div style={{ background: '#10B981', color: '#FFF', padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 800 }}>Save Template</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, flex: 1 }}>
                  <div style={{ background: colors.navBg, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5 }}>
                    {`<div style="font-family: sans-serif;">\n  <h2>Welcome {{user_name}}!</h2>\n  <p>Thank you for subscribing to updates.</p>\n</div>`}
                  </div>
                  <div style={{ background: '#FFFFFF', border: `1px solid ${colors.border}`, borderRadius: 12, padding: 20, color: '#0F172A' }}>
                    <h2 style={{ color: '#2563EB', margin: '0 0 12px 0' }}>Welcome Alex!</h2>
                    <p style={{ margin: 0, color: '#64748B' }}>Thank you for subscribing to updates.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </AbsoluteFill>
  );
}

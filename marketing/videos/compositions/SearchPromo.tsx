import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';
import { BrandHeader } from '../components/BrandHeader';
import { getVideoTheme } from '../theme';

interface DemoTrade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  company: string;
  executions: number;
  pnl: number;
  date: string;
  year: number;
  month: string; // 'may', 'apr', etc.
}

const ALL_TRADES: DemoTrade[] = [
  {
    id: 't1',
    symbol: 'NVDA',
    side: 'LONG',
    company: 'NVIDIA CORP',
    executions: 4,
    pnl: 420.5,
    date: 'May 28, 2024',
    year: 2024,
    month: 'may',
  },
  {
    id: 't2',
    symbol: 'NVDA',
    side: 'SHORT',
    company: 'NVIDIA CORP',
    executions: 12,
    pnl: -115.0,
    date: 'May 14, 2024',
    year: 2024,
    month: 'may',
  },
  {
    id: 't3',
    symbol: 'NVDA',
    side: 'LONG',
    company: 'NVIDIA CORP',
    executions: 3,
    pnl: 185.2,
    date: 'May 3, 2024',
    year: 2024,
    month: 'may',
  },
  {
    id: 't4',
    symbol: 'NVDA',
    side: 'SHORT',
    company: 'NVIDIA CORP',
    executions: 18,
    pnl: 290.0,
    date: 'May 20, 2025',
    year: 2025,
    month: 'may',
  },
  {
    id: 't5',
    symbol: 'NVDA',
    side: 'SHORT',
    company: 'NVIDIA CORP',
    executions: 48,
    pnl: -170.8,
    date: 'Apr 15, 2026',
    year: 2026,
    month: 'apr',
  },
  {
    id: 't6',
    symbol: 'NVDA',
    side: 'LONG',
    company: 'NVIDIA CORP',
    executions: 29,
    pnl: 166.02,
    date: 'Jan 28, 2026',
    year: 2026,
    month: 'jan',
  },
  {
    id: 't7',
    symbol: 'NVDA',
    side: 'SHORT',
    company: 'NVIDIA CORP',
    executions: 5,
    pnl: -40.69,
    date: 'Mar 6, 2026',
    year: 2026,
    month: 'mar',
  },
];

export function SearchPromo({
  themeMode = 'dark',
  startFrameOffset = 0,
}: {
  themeMode?: 'light' | 'dark';
  startFrameOffset?: number;
}) {
  const videoTheme = getVideoTheme(themeMode);
  const rawFrame = useCurrentFrame();
  const frame = (rawFrame + startFrameOffset) % 330;
  const { fps } = useVideoConfig();

  // Container entrance
  const containerSpring = spring({
    frame: Math.max(0, frame - 4),
    fps,
    config: { damping: 16, stiffness: 120 },
  });

  // Query progression:
  // Phase 1 (frames 0 - 95): Type "nvda"
  // Phase 2 (frames 95 - 175): Type " may" -> "nvda may"
  // Phase 3 (frames 175 - 330): Type " 2024" -> "nvda may 2024"
  let currentQuery = '';
  let phase: 1 | 2 | 3 = 1;

  if (frame < 20) {
    currentQuery = '';
    phase = 1;
  } else if (frame < 95) {
    const chars = Math.min(
      4,
      Math.floor(interpolate(frame, [20, 48], [0, 4], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
    );
    currentQuery = 'nvda'.slice(0, chars);
    phase = 1;
  } else if (frame < 175) {
    const addedChars = Math.min(
      4,
      Math.floor(interpolate(frame, [95, 122], [0, 4], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
    );
    currentQuery = 'nvda' + ' may'.slice(0, addedChars);
    phase = 2;
  } else {
    const addedChars = Math.min(
      5,
      Math.floor(interpolate(frame, [175, 205], [0, 5], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
    );
    currentQuery = 'nvda may' + ' 2024'.slice(0, addedChars);
    phase = 3;
  }

  // Blinking cursor
  const showCursor = Math.floor(frame / 12) % 2 === 0;

  // Filtered trades based on phase / query
  const visibleTrades = ALL_TRADES.filter((t) => {
    if (phase === 1) return true;
    if (phase === 2) return t.month === 'may';
    return t.month === 'may' && t.year === 2024;
  });

  // Active highlighted row (index 0 is selected)
  const activeIndex = 0;

  // Enter press animation on phase 3 (around frame 255-295)
  const isOpening = frame >= 265 && frame < 305;

  // Fade out near end for seamless looping
  const fadeOut = interpolate(frame, [315, 329], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 15%, ${videoTheme.accent}35, transparent 65%), ${videoTheme.background}`,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        overflow: 'hidden',
        opacity: fadeOut,
      }}
    >
      {/* Brand Header: 170px Owl SVG Logo + "Quick Search" Title (78px) */}
      <BrandHeader themeMode={themeMode} title="Quick Search" logoSize={170} />

      {/* Main Search Modal Window Container */}
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
          padding: '38px 40px 30px 40px',
          opacity: containerSpring,
          transform: `scale(${interpolate(containerSpring, [0, 1], [0.95, 1])})`,
        }}
      >
        {/* Search Input Bar */}
        <div
          style={{
            height: 112,
            borderRadius: 26,
            border: `3px solid ${videoTheme.accent}`,
            boxShadow: `0 0 0 6px ${videoTheme.accent}25`,
            background: videoTheme.cardRaised,
            display: 'flex',
            alignItems: 'center',
            padding: '0 32px',
            gap: 24,
            marginBottom: 32,
            flexShrink: 0,
          }}
        >
          {/* Magnifying Search Icon */}
          <svg
            width="42"
            height="42"
            viewBox="0 0 24 24"
            fill="none"
            stroke={videoTheme.accent}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>

          {/* Search Query Text or Placeholder */}
          <div
            style={{
              flex: 1,
              fontSize: 44,
              fontWeight: 500,
              color: currentQuery ? videoTheme.foreground : videoTheme.muted,
              display: 'flex',
              alignItems: 'center',
              letterSpacing: -0.5,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            {currentQuery ? (
              <>
                <span>{currentQuery}</span>
                {showCursor && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: 3,
                      height: 48,
                      backgroundColor: videoTheme.accent,
                      marginLeft: 4,
                    }}
                  />
                )}
              </>
            ) : (
              <span style={{ opacity: 0.6, fontSize: 36 }}>Try NVDA may 2024, AAPL losses...</span>
            )}
          </div>

          {/* ESC Badge */}
          <div
            style={{
              padding: '10px 20px',
              borderRadius: 14,
              border: `2px solid ${videoTheme.border}`,
              background: videoTheme.card,
              color: videoTheme.muted,
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: 1.2,
            }}
          >
            ESC
          </div>
        </div>

        {/* Section Header: TRADES */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
            paddingLeft: 12,
            paddingRight: 12,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: 2,
              color: videoTheme.muted,
              textTransform: 'uppercase',
            }}
          >
            TRADES
          </div>

          {/* Date Narrowing Badge Tag */}
          {phase === 2 && (
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: videoTheme.accentBright,
                background: `${videoTheme.accent}20`,
                padding: '6px 16px',
                borderRadius: 12,
              }}
            >
              Month: May
            </div>
          )}
          {phase === 3 && (
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: videoTheme.accentBright,
                background: `${videoTheme.accent}20`,
                padding: '6px 16px',
                borderRadius: 12,
              }}
            >
              May 2024
            </div>
          )}
        </div>

        {/* Trades List */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            overflow: 'hidden',
          }}
        >
          {visibleTrades.map((trade, idx) => {
            // Animate each row entrance smoothly
            const rowSpring = spring({
              frame: Math.max(0, frame - 25 - idx * 4),
              fps,
              config: { damping: 16, stiffness: 160 },
            });
            const isActive = idx === activeIndex && currentQuery.length > 0;

            const isProfit = trade.pnl >= 0;
            const pnlColor = isProfit ? videoTheme.profit : videoTheme.loss;
            const pnlFormatted = `${isProfit ? '+' : '-'}$${Math.abs(trade.pnl).toFixed(2)}`;

            return (
              <div
                key={trade.id}
                style={{
                  opacity: rowSpring,
                  transform: `translateY(${interpolate(rowSpring, [0, 1], [24, 0])}px) scale(${
                    isActive && isOpening ? 1.02 : 1
                  })`,
                  borderRadius: 24,
                  background: isActive ? `${videoTheme.accent}18` : 'transparent',
                  border: isActive ? `2px solid ${videoTheme.accent}40` : '2px solid transparent',
                  padding: '18px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 24,
                  transition: 'all 0.15s ease',
                  boxShadow: isActive && isOpening ? `0 12px 30px ${videoTheme.accent}30` : 'none',
                }}
              >
                {/* Dollar Icon Badge */}
                <div
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 20,
                    background: isActive ? videoTheme.accent : videoTheme.cardRaised,
                    color: isActive ? '#FFFFFF' : videoTheme.muted,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: isActive ? `0 8px 24px ${videoTheme.accent}45` : 'none',
                  }}
                >
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                    <path d="M12 18V6" />
                  </svg>
                </div>

                {/* Trade Details (Title, Side, Subtitle) */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span
                      style={{
                        fontSize: 34,
                        fontWeight: 900,
                        color: videoTheme.foreground,
                        letterSpacing: -0.5,
                      }}
                    >
                      {trade.symbol}
                    </span>
                    <span
                      style={{
                        fontSize: 22,
                        fontWeight: 800,
                        letterSpacing: 1.5,
                        color: videoTheme.muted,
                        textTransform: 'uppercase',
                      }}
                    >
                      {trade.side}
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 500,
                      color: videoTheme.muted,
                      marginTop: 4,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {trade.company} · {trade.side.toLowerCase()} · {trade.executions} executions
                  </div>
                </div>

                {/* P&L & Date */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 6,
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      fontSize: 34,
                      fontWeight: 900,
                      color: pnlColor,
                      letterSpacing: -0.5,
                    }}
                  >
                    {pnlFormatted}
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 600,
                      color: trade.month === 'may' ? videoTheme.accentBright : videoTheme.muted,
                    }}
                  >
                    {trade.date}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Bar (Teaches date narrowing naturally) */}
        <div
          style={{
            marginTop: 18,
            paddingTop: 22,
            borderTop: `2px solid ${videoTheme.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 23,
              fontWeight: 600,
              color: videoTheme.muted,
              letterSpacing: 0.2,
            }}
          >
            {phase === 1 && 'Showing first 50 — add a date to narrow (e.g. "NVDA may 2024")'}
            {phase === 2 && 'Narrowed by month: May across years · Add year to pin'}
            {phase === 3 && '3 matching trades · Filters: symbol: · side: · date (may 2024)'}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 23,
              fontWeight: 700,
              color: isOpening ? videoTheme.accentBright : videoTheme.foreground,
              transform: isOpening ? 'scale(1.08)' : 'scale(1)',
              transition: 'transform 0.15s ease',
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 10 4 15 9 20" />
              <path d="M20 4v7a4 4 0 0 1-4 4H4" />
            </svg>
            <span>Open</span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import React from 'react';

interface ComicBadgeProps {
  text: string;
  subtext?: string;
  delay?: number;
  color?: string;
  bgColor?: string;
  rotate?: number;
  top?: number | string;
  left?: number | string;
  right?: number | string;
  bottom?: number | string;
  scale?: number;
}

export function ComicBadge({
  text,
  subtext,
  delay = 0,
  color = '#FFFFFF',
  bgColor = '#FF3B30',
  rotate = -6,
  top,
  left,
  right,
  bottom,
  scale = 1,
}: ComicBadgeProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 220, mass: 0.5 },
  });

  const pulse = interpolate((frame - delay) % 30, [0, 15, 30], [1, 1.05, 1]);

  if (frame < delay) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        right,
        bottom,
        zIndex: 50,
        opacity: Math.min(1, pop * 2),
        transform: `scale(${pop * scale * pulse}) rotate(${rotate}deg)`,
        transformOrigin: 'center center',
      }}
    >
      <div
        style={{
          background: bgColor,
          color,
          padding: '14px 28px',
          borderRadius: 20,
          border: '4px solid #000000',
          boxShadow: '8px 8px 0px #000000',
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textTransform: 'uppercase',
        }}
      >
        <span
          style={{
            fontFamily: 'Impact, SF Pro Display, sans-serif',
            fontSize: 42,
            fontWeight: 900,
            letterSpacing: 2,
            textShadow: '3px 3px 0px #000000',
            lineHeight: 1,
          }}
        >
          {text}
        </span>
        {subtext && (
          <span
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: '#FFFFFF',
              marginTop: 4,
              letterSpacing: 1,
            }}
          >
            {subtext}
          </span>
        )}
      </div>
    </div>
  );
}

interface ComicStarburstProps {
  delay?: number;
  size?: number;
  top?: number | string;
  left?: number | string;
  color?: string;
}

export function ComicStarburst({
  delay = 0,
  size = 300,
  top = '30%',
  left = '40%',
  color = '#FFCC00',
}: ComicStarburstProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = spring({
    frame: frame - delay,
    fps,
    config: { damping: 10, stiffness: 250 },
  });

  const rotate = interpolate(frame, [0, 300], [0, 90]);

  if (frame < delay || frame > delay + 45) return null;

  const points = [];
  const count = 16;
  const outerR = size / 2;
  const innerR = outerR * 0.45;

  for (let i = 0; i < count * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / count) * i;
    const x = outerR + r * Math.cos(angle);
    const y = outerR + r * Math.sin(angle);
    points.push(`${x},${y}`);
  }

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        zIndex: 40,
        opacity: interpolate(frame - delay, [30, 45], [1, 0], { extrapolateLeft: 'clamp' }),
        transform: `scale(${pop}) rotate(${rotate}deg)`,
        pointerEvents: 'none',
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <polygon points={points.join(' ')} fill={color} stroke="#000000" strokeWidth="6" />
      </svg>
    </div>
  );
}

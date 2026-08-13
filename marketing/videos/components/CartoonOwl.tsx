import React from 'react';

/**
 * Cartoon Owl character matching the Trading Diary logo (blue circular eyes with green/red candlestick pupil details).
 */
export const CartoonOwl: React.FC<{
  size?: number;
  isExcited?: boolean;
  wingWave?: boolean;
}> = ({ size = 180, isExcited = false, wingWave = false }) => {
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 200 220" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Body Shadow */}
      <ellipse cx="100" cy="205" rx="55" ry="10" fill="#000000" opacity="0.2" />

      {/* Feet */}
      <path d="M70 195 L65 205 M70 195 L70 207 M70 195 L75 205" stroke="#F59E0B" strokeWidth="6" strokeLinecap="round" />
      <path d="M130 195 L125 205 M130 195 L130 207 M130 195 L135 205" stroke="#F59E0B" strokeWidth="6" strokeLinecap="round" />

      {/* Main Body (Deep Navy Blue Owl) */}
      <rect x="40" y="50" width="120" height="150" rx="60" fill="#1E293B" stroke="#0F172A" strokeWidth="6" />

      {/* Feather Belly Details */}
      <ellipse cx="100" cy="140" rx="40" ry="45" fill="#334155" />
      <path d="M85 130 Q100 138 115 130" stroke="#475569" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M88 145 Q100 153 112 145" stroke="#475569" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M90 160 Q100 168 110 160" stroke="#475569" strokeWidth="4" strokeLinecap="round" fill="none" />

      {/* Left Ear Tuft */}
      <path d="M50 60 L30 25 L65 45 Z" fill="#1E293B" stroke="#0F172A" strokeWidth="5" strokeLinejoin="round" />

      {/* Right Ear Tuft */}
      <path d="M150 60 L170 25 L135 45 Z" fill="#1E293B" stroke="#0F172A" strokeWidth="5" strokeLinejoin="round" />

      {/* Wings */}
      {/* Left Wing */}
      <path
        d="M40 100 Q15 130 35 160"
        stroke="#0F172A"
        strokeWidth="6"
        fill="#1E293B"
        transform={isExcited ? 'rotate(-25, 40, 100)' : 'none'}
      />
      {/* Right Wing */}
      <path
        d="M160 100 Q185 130 165 160"
        stroke="#0F172A"
        strokeWidth="6"
        fill="#1E293B"
        transform={wingWave ? 'rotate(35, 160, 100)' : 'none'}
      />

      {/* Signature Candlestick Glasses/Eyes Frame (Matches Logo) */}
      <rect x="42" y="65" width="116" height="56" rx="28" fill="#2563EB" stroke="#0F172A" strokeWidth="6" />

      {/* Left Eye Socket */}
      <circle cx="70" cy="93" r="22" fill="#FFFFFF" stroke="#0F172A" strokeWidth="4" />
      {/* Left Pupil - Green Bullish Candlestick */}
      <rect x="65" y="81" width="10" height="24" rx="3" fill="#10B981" />
      <line x1="70" y1="76" x2="70" y2="110" stroke="#10B981" strokeWidth="3" strokeLinecap="round" />

      {/* Right Eye Socket */}
      <circle cx="130" cy="93" r="22" fill="#FFFFFF" stroke="#0F172A" strokeWidth="4" />
      {/* Right Pupil - Red Bearish Candlestick */}
      <rect x="125" y="81" width="10" height="24" rx="3" fill="#EF4444" />
      <line x1="130" y1="76" x2="130" y2="110" stroke="#EF4444" strokeWidth="3" strokeLinecap="round" />

      {/* Cute Beak */}
      <polygon points="100,102 91,116 109,116" fill="#F59E0B" stroke="#0F172A" strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
};

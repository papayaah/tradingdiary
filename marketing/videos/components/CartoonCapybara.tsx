import React from 'react';

/**
 * Cartoon Capybara mascot character sitting at a trading laptop setup.
 */
export const CartoonCapybara: React.FC<{
  size?: number;
  isTyping?: boolean;
  isCelebrating?: boolean;
}> = ({ size = 200, isTyping = true, isCelebrating = false }) => {
  return (
    <svg width={size} height={size * 1.05} viewBox="0 0 220 230" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Floor Shadow */}
      <ellipse cx="110" cy="215" rx="75" ry="12" fill="#000000" opacity="0.2" />

      {/* Capybara Body (Warm Golden Brown) */}
      <path d="M55 110 C55 80, 85 70, 120 70 C160 70, 180 90, 185 130 C190 170, 160 200, 110 200 C65 200, 55 170, 55 110 Z" fill="#A16207" stroke="#451A03" strokeWidth="6" />

      {/* Capybara Snout Boxy Nose */}
      <rect x="140" y="95" width="50" height="45" rx="16" fill="#78350F" stroke="#451A03" strokeWidth="5" />
      {/* Nostril Dots */}
      <circle cx="170" cy="115" r="4" fill="#451A03" />
      <circle cx="182" cy="115" r="4" fill="#451A03" />

      {/* Eyes (Chill / Sleeping vibe) */}
      <path d="M115 95 Q125 88 135 95" stroke="#451A03" strokeWidth="5" strokeLinecap="round" fill="none" />

      {/* Small Cute Ear */}
      <ellipse cx="85" cy="72" rx="10" ry="14" fill="#78350F" stroke="#451A03" strokeWidth="4" transform="rotate(-15, 85, 72)" />

      {/* Orange/Citrus slice on Capybara's head */}
      <circle cx="110" cy="55" r="16" fill="#F97316" stroke="#451A03" strokeWidth="4" />
      <circle cx="110" cy="55" r="11" fill="#FFEDD5" />
      <path d="M102 55 L118 55 M110 47 L110 63" stroke="#F97316" strokeWidth="3" />

      {/* Paws on Laptop */}
      {isCelebrating ? (
        <>
          <path d="M120 120 Q110 80 100 90" stroke="#78350F" strokeWidth="12" strokeLinecap="round" />
          <path d="M140 120 Q150 80 160 90" stroke="#78350F" strokeWidth="12" strokeLinecap="round" />
        </>
      ) : (
        <path d="M135 150 L160 155 M145 160 L168 165" stroke="#78350F" strokeWidth="10" strokeLinecap="round" />
      )}

      {/* Laptop desk setup */}
      <rect x="145" y="150" width="60" height="40" rx="6" fill="#94A3B8" stroke="#0F172A" strokeWidth="4" transform="rotate(-10, 145, 150)" />
      {/* Laptop Screen */}
      <rect x="175" y="115" width="40" height="35" rx="4" fill="#0F172A" stroke="#475569" strokeWidth="3" transform="rotate(10, 175, 115)" />
      {/* Green candlestick chart glow on laptop screen */}
      <path d="M185 138 L185 125 M195 140 L195 120" stroke="#10B981" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
};

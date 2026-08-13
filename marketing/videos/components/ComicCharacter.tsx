import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Animated Vector Comic Character built with pure SVG & Remotion springs.
 * Props control expressive states (talking, blinking, pointing) and speech bubble text.
 */
export const ComicCharacter: React.FC<{
  speechText?: string;
  isTalking?: boolean;
  pointingDirection?: 'left' | 'right' | 'down';
}> = ({ speechText = "Hi! Let's get started!", isTalking = true, pointingDirection = 'right' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring
  const scaleSpring = spring({ frame, fps, config: { damping: 12, stiffness: 120 } });

  // Mouth animation (talking pulse)
  const mouthOpen = isTalking ? Math.abs(Math.sin(frame * 0.4)) * 14 : 4;

  // Eye blink every ~60 frames
  const isBlinking = frame % 60 < 4;

  // Speech bubble pop-in spring
  const bubbleSpring = spring({ frame: Math.max(0, frame - 15), fps, config: { damping: 14, stiffness: 140 } });

  // Floating idle motion
  const floatY = Math.sin(frame * 0.08) * 8;

  // Arm angle based on pointing direction
  const armAngle = pointingDirection === 'right' ? -45 : pointingDirection === 'left' ? 45 : -10;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        transform: `translateY(${floatY}px) scale(${scaleSpring})`,
        transformOrigin: 'bottom center',
      }}
    >
      {/* Speech Bubble */}
      {speechText && (
        <div
          style={{
            position: 'relative',
            background: '#FFFFFF',
            color: '#0F172A',
            border: '4px solid #0F172A',
            borderRadius: 20,
            padding: '16px 24px',
            fontSize: 20,
            fontWeight: 800,
            maxWidth: 320,
            boxShadow: '6px 6px 0px #0F172A',
            opacity: bubbleSpring,
            transform: `scale(${bubbleSpring}) translateY(${interpolate(bubbleSpring, [0, 1], [-20, 0])}px)`,
            transformOrigin: 'bottom right',
          }}
        >
          {speechText}
          {/* Bubble tail pointing to character */}
          <div
            style={{
              position: 'absolute',
              right: -16,
              bottom: 24,
              width: 0,
              height: 0,
              borderTop: '12px solid transparent',
              borderBottom: '12px solid transparent',
              borderLeft: '16px solid #0F172A',
            }}
          />
          <div
            style={{
              position: 'absolute',
              right: -10,
              bottom: 26,
              width: 0,
              height: 0,
              borderTop: '9px solid transparent',
              borderBottom: '9px solid transparent',
              borderLeft: '13px solid #FFFFFF',
            }}
          />
        </div>
      )}

      {/* SVG Comic Mascot */}
      <svg width="220" height="260" viewBox="0 0 220 260" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Shadow */}
        <ellipse cx="110" cy="245" rx="65" ry="10" fill="#000000" opacity="0.15" />

        {/* Body (Cute rounded torso) */}
        <rect x="65" y="130" width="90" height="100" rx="30" fill="#3B82F6" stroke="#0F172A" strokeWidth="6" />

        {/* Mascot Badge/Logo */}
        <circle cx="110" cy="170" r="16" fill="#F59E0B" stroke="#0F172A" strokeWidth="4" />
        <path d="M104 170L108 174L116 166" stroke="#0F172A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />

        {/* Left Arm */}
        <rect
          x="35"
          y="140"
          width="30"
          height="70"
          rx="15"
          fill="#3B82F6"
          stroke="#0F172A"
          strokeWidth="6"
          transform={`rotate(${armAngle}, 65, 145)`}
        />

        {/* Right Arm (Waving) */}
        <rect
          x="155"
          y="140"
          width="30"
          height="70"
          rx="15"
          fill="#3B82F6"
          stroke="#0F172A"
          strokeWidth="6"
          transform={`rotate(${Math.sin(frame * 0.3) * 20 - 30}, 155, 145)`}
        />

        {/* Head */}
        <circle cx="110" cy="90" r="60" fill="#FDE047" stroke="#0F172A" strokeWidth="6" />

        {/* Cheeks */}
        <ellipse cx="75" cy="105" rx="10" ry="6" fill="#F87171" opacity="0.7" />
        <ellipse cx="145" cy="105" rx="10" ry="6" fill="#F87171" opacity="0.7" />

        {/* Eyes */}
        {isBlinking ? (
          <>
            <path d="M70 85Q80 92 90 85" stroke="#0F172A" strokeWidth="6" strokeLinecap="round" />
            <path d="M130 85Q140 92 150 85" stroke="#0F172A" strokeWidth="6" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="80" cy="82" r="9" fill="#0F172A" />
            <circle cx="140" cy="82" r="9" fill="#0F172A" />
            {/* Eye Highlights */}
            <circle cx="77" cy="79" r="3" fill="#FFFFFF" />
            <circle cx="137" cy="79" r="3" fill="#FFFFFF" />
          </>
        )}

        {/* Mouth (Dynamic talk height) */}
        <path
          d={`M85 110 Q110 ${110 + mouthOpen} 135 110 Z`}
          fill="#0F172A"
          stroke="#0F172A"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        {isTalking && mouthOpen > 6 && (
          <path d={`M95 114 Q110 ${114 + mouthOpen * 0.6} 125 114`} fill="#F87171" />
        )}
      </svg>
    </div>
  );
};

import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { ComicCharacter } from '../components/ComicCharacter';

export function ComicTutorialPromo() {
  const frame = useCurrentFrame();

  // Dynamic speech text depending on frame step
  let speechText = "Hi! Welcome to React Engage!";
  let pointerDir: 'left' | 'right' | 'down' = 'right';

  if (frame > 60 && frame <= 140) {
    speechText = "Step 1: Click the bottom Help widget!";
    pointerDir = 'down';
  } else if (frame > 140 && frame <= 220) {
    speechText = "Step 2: Submit bugs with auto-telemetry!";
    pointerDir = 'right';
  } else if (frame > 220) {
    speechText = "Step 3: Reply to users in Admin panel!";
    pointerDir = 'left';
  }

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#F8FAFC',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: 60,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Title */}
      <div style={{ position: 'absolute', top: 60, textAlign: 'center' }}>
        <h1 style={{ fontSize: 44, fontWeight: 900, color: '#0F172A', margin: '0 0 10px 0' }}>
          Interactive Remotion Tutorial
        </h1>
        <p style={{ fontSize: 20, color: '#64748B', margin: 0 }}>
          Featuring dynamic vector comic guide
        </p>
      </div>

      {/* Comic Mascot Showcase */}
      <div style={{ position: 'absolute', bottom: 120, right: 80 }}>
        <ComicCharacter
          speechText={speechText}
          isTalking={frame % 20 < 14}
          pointingDirection={pointerDir}
        />
      </div>
    </AbsoluteFill>
  );
}

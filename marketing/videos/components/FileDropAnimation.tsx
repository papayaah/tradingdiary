import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { videoTheme } from '../theme';

export function FileDropAnimation() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dropZoneIn = spring({ frame: frame - 40, fps, config: { damping: 18, stiffness: 140 } });
  const drag = interpolate(frame, [58, 116], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fileOpacity = interpolate(frame, [54, 62, 116, 126], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const dropPulse = spring({ frame: frame - 116, fps, config: { damping: 12, stiffness: 220 } });
  const fileX = interpolate(drag, [0, 0.45, 1], [330, 520, 540]);
  const fileY = interpolate(drag, [0, 0.45, 1], [590, 825, 1085]);
  const cursorX = fileX + 150;
  const cursorY = fileY + 54;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 160,
          right: 160,
          top: 1010,
          height: 300,
          borderRadius: 38,
          border: `4px dashed ${videoTheme.accent}`,
          background: `${videoTheme.accent}12`,
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
          opacity: dropZoneIn,
          transform: `scale(${interpolate(dropPulse, [0, 1], [1, 1.035])})`,
          boxShadow: `0 0 ${interpolate(dropPulse, [0, 1], [0, 70])}px ${videoTheme.accent}55`,
        }}
      >
        <div>
          <div style={{ color: videoTheme.accentBright, fontSize: 62 }}>⇩</div>
          <div style={{ color: videoTheme.foreground, fontSize: 34, fontWeight: 850, marginTop: 12 }}>Drop your IBKR statement</div>
          <div style={{ color: videoTheme.muted, fontSize: 23, marginTop: 12 }}>Trading Diary handles the rest.</div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: fileX,
          top: fileY,
          width: 360,
          height: 108,
          borderRadius: 20,
          background: '#F6F8FA',
          border: '3px solid #B6C7FF',
          color: '#172033',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          fontSize: 22,
          fontWeight: 850,
          boxShadow: '0 24px 50px rgba(0,0,0,.35)',
          opacity: fileOpacity,
          transform: `translate(-50%, -50%) rotate(${interpolate(drag, [0, 1], [-2, 2])}deg)`,
          zIndex: 5,
        }}
      >
        <span style={{ fontSize: 38, marginRight: 16, color: videoTheme.accent }}>▧</span>
        IBKR_JULY_TRADES.tlg
      </div>

      <svg
        viewBox="0 0 60 76"
        style={{
          position: 'absolute',
          left: cursorX,
          top: cursorY,
          width: 55,
          height: 70,
          opacity: fileOpacity,
          zIndex: 6,
          filter: 'drop-shadow(0 6px 8px rgba(0,0,0,.45))',
        }}
      >
        <path d="M4 3L48 43L28 47L19 69L4 3Z" fill="white" stroke="#111827" strokeWidth="4" strokeLinejoin="round" />
      </svg>
    </>
  );
}

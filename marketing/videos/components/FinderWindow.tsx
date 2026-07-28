import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export function FinderWindow() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 18, fps, config: { damping: 18, stiffness: 140 } });
  const exit = interpolate(frame, [118, 136], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fileOpacity = interpolate(frame, [58, 70], [1, 0.18], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        position: 'absolute',
        left: 80,
        right: 80,
        top: 430,
        height: 470,
        borderRadius: 34,
        overflow: 'hidden',
        background: '#F4F6F8',
        boxShadow: '0 40px 90px rgba(0,0,0,.42)',
        opacity: enter * exit,
        transform: `translateY(${interpolate(enter, [0, 1], [50, 0])}px) scale(${interpolate(exit, [0, 1], [0.95, 1])})`,
        color: '#172033',
      }}
    >
      <div
        style={{
          height: 72,
          display: 'flex',
          alignItems: 'center',
          padding: '0 28px',
          background: '#E9EDF1',
          borderBottom: '2px solid #D8DEE5',
        }}
      >
        {['#FF5F57', '#FFBD2E', '#28C840'].map((color) => (
          <div key={color} style={{ width: 22, height: 22, borderRadius: '50%', background: color, marginRight: 14 }} />
        ))}
        <div style={{ marginLeft: 28, fontSize: 25, fontWeight: 800 }}>Downloads</div>
        <div style={{ marginLeft: 'auto', color: '#7C8796', fontSize: 21 }}>⌕</div>
      </div>
      <div style={{ display: 'flex', height: 398 }}>
        <div style={{ width: 210, background: '#EDF1F4', padding: '32px 24px', color: '#687386', fontSize: 21, lineHeight: 2.4 }}>
          <div>★ Favorites</div>
          <div style={{ color: '#40516C', fontWeight: 800 }}>↓ Downloads</div>
          <div>▣ Documents</div>
          <div>☁ iCloud Drive</div>
        </div>
        <div style={{ flex: 1, padding: '30px 32px' }}>
          <div style={{ color: '#86909E', display: 'grid', gridTemplateColumns: '1fr 170px 100px', fontSize: 18, padding: '0 18px 18px' }}>
            <span>Name</span><span>Date Modified</span><span>Size</span>
          </div>
          <div
            style={{
              height: 86,
              borderRadius: 16,
              display: 'grid',
              gridTemplateColumns: '1fr 170px 100px',
              alignItems: 'center',
              padding: '0 18px',
              background: '#DCE5FF',
              border: '2px solid #B6C7FF',
              fontSize: 20,
              opacity: fileOpacity,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', fontWeight: 800 }}>
              <span style={{ fontSize: 34, marginRight: 16 }}>▧</span> IBKR_JULY_TRADES.tlg
            </span>
            <span style={{ color: '#687386' }}>Today, 10:42 AM</span>
            <span style={{ color: '#687386' }}>110 KB</span>
          </div>
          <div style={{ height: 62, borderBottom: '2px solid #E5E9EE' }} />
          <div style={{ height: 62, borderBottom: '2px solid #E5E9EE' }} />
        </div>
      </div>
    </div>
  );
}

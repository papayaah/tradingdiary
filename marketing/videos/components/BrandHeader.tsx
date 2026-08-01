import { getVideoTheme } from '../theme';

export function BrandHeader({ themeMode = 'dark' }: { themeMode?: 'light' | 'dark' }) {
  const videoTheme = getVideoTheme(themeMode);

  return (
    <div
      style={{
        position: 'absolute',
        left: 68,
        right: 68,
        top: 68,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: 62,
          height: 62,
          borderRadius: 18,
          background: videoTheme.accent,
          display: 'grid',
          placeItems: 'center',
          color: 'white',
          fontSize: 31,
          fontWeight: 900,
        }}
      >
        ⇧
      </div>
      <div style={{ color: videoTheme.foreground, fontSize: 27, fontWeight: 850, letterSpacing: 2.2, marginLeft: 20 }}>
        TRADING DIARY
      </div>
      <div
        style={{
          marginLeft: 'auto',
          borderRadius: 24,
          padding: '13px 22px',
          color: videoTheme.profit,
          background: `${videoTheme.profit}1C`,
          fontSize: 19,
          fontWeight: 800,
          letterSpacing: 1,
        }}
      >
        ● &nbsp; SCANNER ACTIVE
      </div>
    </div>
  );
}

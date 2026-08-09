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
          width: 58,
          height: 58,
          display: 'grid',
          placeItems: 'center',
          filter: `drop-shadow(0 4px 12px ${videoTheme.accent}66)`,
        }}
      >
        <img
          src="/brand/market-watcher-owl.svg"
          alt="Market Watcher Owl"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
      <div style={{ color: videoTheme.foreground, fontSize: 27, fontWeight: 850, letterSpacing: 2.2, marginLeft: 16 }}>
        TRADING DIARY
      </div>
    </div>
  );
}

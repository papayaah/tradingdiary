import type { MediaThemeTokens } from '@/packages/react-media-library/src/theme';

export const tradingDiaryMediaTheme: Partial<MediaThemeTokens> = {
  background: 'var(--background)',
  surface: 'var(--card-bg)',
  surfaceMuted: 'var(--muted-bg)',
  foreground: 'var(--foreground)',
  muted: 'var(--muted)',
  border: 'var(--card-border)',
  accent: 'var(--accent)',
  accentSoft: 'var(--accent-light)',
  danger: 'var(--loss)',
  dangerSoft: 'color-mix(in srgb, var(--loss) 12%, transparent)',
  warning: '#f59e0b',
};

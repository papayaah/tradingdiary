export const darkVideoTheme = {
  background: '#080D17',
  card: '#111827',
  cardRaised: '#172033',
  border: '#26334A',
  foreground: '#F3F5FA',
  muted: '#98A2B5',
  accent: '#6366F1',
  accentBright: '#818CF8',
  profit: '#10B981',
  loss: '#EF4444',
  grid: '#243047',
} as const;

export const lightVideoTheme = {
  background: '#FFFFFF',
  card: '#F8FAFC',
  cardRaised: '#E2E8F0',
  border: '#CBD5E1',
  foreground: '#0F172A',
  muted: '#64748B',
  accent: '#4F46E5',
  accentBright: '#6366F1',
  profit: '#059669',
  loss: '#DC2626',
  grid: '#E2E8F0',
} as const;

export type VideoTheme = typeof darkVideoTheme;

export function getVideoTheme(mode: 'light' | 'dark' = 'dark'): VideoTheme {
  return mode === 'light' ? lightVideoTheme : darkVideoTheme;
}

export const videoTheme = darkVideoTheme;

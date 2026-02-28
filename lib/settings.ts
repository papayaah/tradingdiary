const SETTINGS_KEY = 'tradingdiary-settings';

export interface AppSettings {
  /**
   * Trade date cutoff time in "HH:MM" 24-hour format.
   * Trades with time >= cutoff get their effective date shifted to the next calendar day.
   * null means no cutoff (use file dates as-is).
   */
  tradeDateCutoff: string | null;
}

const defaults: AppSettings = {
  tradeDateCutoff: null,
};

export function getSettings(): AppSettings {
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: Partial<AppSettings>): void {
  if (typeof window === 'undefined') return;
  const current = getSettings();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...settings }));
}

export function getTradeDateCutoff(): string | null {
  return getSettings().tradeDateCutoff;
}

export function setTradeDateCutoff(cutoff: string | null): void {
  saveSettings({ tradeDateCutoff: cutoff });
}

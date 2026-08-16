const SETTINGS_KEY = 'tradingdiary-settings';

export interface AppSettings {
  /** Show journal trade P&L primarily in the account's base currency. */
  showPnlInBaseCurrency: boolean;
}

const defaults: AppSettings = {
  showPnlInBaseCurrency: false,
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

export function getShowPnlInBaseCurrency(): boolean {
  return getSettings().showPnlInBaseCurrency;
}

export function setShowPnlInBaseCurrency(showInBaseCurrency: boolean): void {
  saveSettings({ showPnlInBaseCurrency: showInBaseCurrency });
}

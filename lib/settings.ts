const SETTINGS_KEY = 'tradingdiary-settings';

export type DashboardRangeType =
  | 'all'
  | '7d'
  | '30d'
  | 'quarter'
  | 'lastquarter'
  | 'mtd'
  | 'ytd'
  | 'custom';

export interface DashboardRangePreference {
  rangeType: DashboardRangeType;
  startDate: string;
  endDate: string;
}

export interface AppSettings {
  /** Show journal trade P&L primarily in the account's base currency. */
  showPnlInBaseCurrency: boolean;
  /** Last dashboard period selected by this browser. */
  dashboardRange: DashboardRangePreference;
}

const defaults: AppSettings = {
  showPnlInBaseCurrency: false,
  dashboardRange: {
    rangeType: 'mtd',
    startDate: '',
    endDate: '',
  },
};

const dashboardRangeTypes = new Set<DashboardRangeType>([
  'all',
  '7d',
  '30d',
  'quarter',
  'lastquarter',
  'mtd',
  'ytd',
  'custom',
]);

function normalizeDashboardRange(value: unknown): DashboardRangePreference {
  if (!value || typeof value !== 'object') return defaults.dashboardRange;
  const candidate = value as Partial<DashboardRangePreference>;
  return {
    rangeType: dashboardRangeTypes.has(candidate.rangeType as DashboardRangeType)
      ? candidate.rangeType as DashboardRangeType
      : defaults.dashboardRange.rangeType,
    startDate: typeof candidate.startDate === 'string' ? candidate.startDate : '',
    endDate: typeof candidate.endDate === 'string' ? candidate.endDate : '',
  };
}

export function getSettings(): AppSettings {
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const stored = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...defaults,
      ...stored,
      dashboardRange: normalizeDashboardRange(stored.dashboardRange),
    };
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

export function getDashboardRangePreference(): DashboardRangePreference {
  return getSettings().dashboardRange;
}

export function setDashboardRangePreference(preference: DashboardRangePreference): void {
  saveSettings({ dashboardRange: normalizeDashboardRange(preference) });
}

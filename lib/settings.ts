import type { DashboardRangeType } from './trading/dashboard-range';

const SETTINGS_KEY = 'tradingdiary-settings';

export type { DashboardRangeType } from './trading/dashboard-range';

export interface DashboardRangePreference {
  rangeType: DashboardRangeType;
  startDate: string;
  endDate: string;
}

/** Chart overlay toggles, persisted globally so they don't reset per chart. */
export interface ChartOverlayPreferences {
  patterns: boolean;
  levels: boolean;
  trendlines: boolean;
}

export interface AppSettings {
  /** Show journal trade P&L primarily in the account's base currency. */
  showPnlInBaseCurrency: boolean;
  /** Last dashboard period selected by this browser. */
  dashboardRange: DashboardRangePreference;
  /** Chart overlay toggles shared across every chart. */
  chartOverlays: ChartOverlayPreferences;
}

const defaults: AppSettings = {
  showPnlInBaseCurrency: false,
  dashboardRange: {
    rangeType: 'mtd',
    startDate: '',
    endDate: '',
  },
  chartOverlays: {
    patterns: false,
    levels: true,
    trendlines: true,
  },
};

const dashboardRangeTypes = new Set<DashboardRangeType>([
  '7d',
  '30d',
  'quarter',
  'lastquarter',
  'lastmonth',
  'mtd',
  'ytd',
  'custom',
]);

function normalizeDashboardRange(value: unknown): DashboardRangePreference {
  if (!value || typeof value !== 'object') return defaults.dashboardRange;
  const candidate = value as Partial<DashboardRangePreference>;
  const startDate = typeof candidate.startDate === 'string' ? candidate.startDate : '';
  const endDate = typeof candidate.endDate === 'string' ? candidate.endDate : '';
  const candidateRangeType = dashboardRangeTypes.has(candidate.rangeType as DashboardRangeType)
    ? candidate.rangeType as DashboardRangeType
    : defaults.dashboardRange.rangeType;
  return {
    // An empty custom period would be indistinguishable from the removed
    // all-time behavior, so fall back to the dashboard default instead.
    rangeType: candidateRangeType === 'custom' && !startDate && !endDate
      ? defaults.dashboardRange.rangeType
      : candidateRangeType,
    startDate,
    endDate,
  };
}

function normalizeChartOverlays(value: unknown): ChartOverlayPreferences {
  if (!value || typeof value !== 'object') return defaults.chartOverlays;
  const candidate = value as Partial<ChartOverlayPreferences>;
  return {
    patterns: typeof candidate.patterns === 'boolean' ? candidate.patterns : defaults.chartOverlays.patterns,
    levels: typeof candidate.levels === 'boolean' ? candidate.levels : defaults.chartOverlays.levels,
    trendlines: typeof candidate.trendlines === 'boolean' ? candidate.trendlines : defaults.chartOverlays.trendlines,
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
      chartOverlays: normalizeChartOverlays(stored.chartOverlays),
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

export function getChartOverlayPreferences(): ChartOverlayPreferences {
  return getSettings().chartOverlays;
}

export function setChartOverlayPreference(key: keyof ChartOverlayPreferences, value: boolean): void {
  const current = getChartOverlayPreferences();
  saveSettings({ chartOverlays: { ...current, [key]: value } });
}

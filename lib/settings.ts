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

/** 'auto' follows the device timezone; otherwise a specific IANA zone id. */
export type DisplayTimezone = string;

export interface AppSettings {
  /** Show journal trade P&L primarily in the account's base currency. */
  showPnlInBaseCurrency: boolean;
  /** Last dashboard period selected by this browser. */
  dashboardRange: DashboardRangePreference;
  /** Chart overlay toggles shared across every chart. */
  chartOverlays: ChartOverlayPreferences;
  /**
   * Timezone used to *display* execution times ('auto' = device zone). Ordering
   * always uses the absolute instant, so this only changes labels, never the
   * sequence of fills.
   */
  displayTimezone: DisplayTimezone;
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
    levels: false,
    trendlines: false,
  },
  displayTimezone: 'auto',
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

function normalizeDisplayTimezone(value: unknown): DisplayTimezone {
  if (value === 'auto' || value == null) return 'auto';
  if (typeof value !== 'string') return 'auto';
  try {
    // Reject anything the runtime can't resolve as an IANA zone.
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return 'auto';
  }
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
      displayTimezone: normalizeDisplayTimezone(stored.displayTimezone),
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

export function getDisplayTimezonePreference(): DisplayTimezone {
  return getSettings().displayTimezone;
}

export function setDisplayTimezonePreference(timezone: DisplayTimezone): void {
  saveSettings({ displayTimezone: normalizeDisplayTimezone(timezone) });
}

/** The device's IANA timezone, or ET as a server-safe fallback. */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

/** Resolve a preference ('auto' or an IANA id) to a concrete IANA zone. */
export function resolveDisplayTimezone(preference?: DisplayTimezone): string {
  const pref = preference ?? getDisplayTimezonePreference();
  return !pref || pref === 'auto' ? deviceTimezone() : pref;
}

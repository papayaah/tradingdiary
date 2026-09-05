import type { DailySummary } from './aggregator';

export type DashboardRangeType =
  | '7d'
  | '30d'
  | 'quarter'
  | 'lastquarter'
  | 'lastmonth'
  | 'mtd'
  | 'ytd'
  | 'custom'
  // A specific calendar month, driven by the dashboard calendar's navigation.
  // The month is carried in `customStartDate` as its first day (YYYY-MM-01).
  | 'month';

export interface DashboardDateRange {
  start: string;
  end: string;
}

function parseDateKey(dateKey: string): Date | null {
  if (!/^\d{8}$/.test(dateKey)) return null;
  const date = new Date(
    Number(dateKey.slice(0, 4)),
    Number(dateKey.slice(4, 6)) - 1,
    Number(dateKey.slice(6, 8)),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

/** Resolve the exact boundaries shared by every historical dashboard section. */
export function resolveDashboardDateRange(
  rangeType: DashboardRangeType,
  latestTradeDate: string | undefined,
  customStartDate = '',
  customEndDate = '',
  now = new Date(),
): DashboardDateRange {
  if (rangeType === 'custom') {
    return {
      start: customStartDate.replaceAll('-', ''),
      end: customEndDate.replaceAll('-', ''),
    };
  }

  if (rangeType === 'month') {
    const anchor = parseDateKey(customStartDate.replaceAll('-', '')) ?? now;
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { start: toDateKey(monthStart), end: toDateKey(monthEnd) };
  }

  // Anchor historical imports to their latest trading day so their relative
  // periods remain populated even when the import predates today.
  const latest = latestTradeDate ? parseDateKey(latestTradeDate) : null;
  const referenceDate = latest && latest.getTime() <= now.getTime() ? latest : now;
  const end = toDateKey(referenceDate);

  if (rangeType === '7d' || rangeType === '30d') {
    const startDate = new Date(referenceDate);
    startDate.setDate(startDate.getDate() - (rangeType === '7d' ? 6 : 29));
    return { start: toDateKey(startDate), end };
  }

  if (rangeType === 'mtd') {
    return {
      start: `${referenceDate.getFullYear()}${String(referenceDate.getMonth() + 1).padStart(2, '0')}01`,
      end,
    };
  }

  if (rangeType === 'ytd') {
    return { start: `${referenceDate.getFullYear()}0101`, end };
  }

  if (rangeType === 'lastmonth') {
    const previousMonthStart = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth() - 1,
      1,
    );
    const previousMonthEnd = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      0,
    );
    return {
      start: toDateKey(previousMonthStart),
      end: toDateKey(previousMonthEnd),
    };
  }

  if (rangeType === 'quarter') {
    const quarterStartMonth = Math.floor(referenceDate.getMonth() / 3) * 3;
    const quarterEnd = new Date(referenceDate.getFullYear(), quarterStartMonth + 3, 0);
    return {
      start: `${referenceDate.getFullYear()}${String(quarterStartMonth + 1).padStart(2, '0')}01`,
      end: toDateKey(quarterEnd),
    };
  }

  const currentQuarter = Math.floor(referenceDate.getMonth() / 3);
  const previousQuarterYear = currentQuarter === 0
    ? referenceDate.getFullYear() - 1
    : referenceDate.getFullYear();
  const previousQuarterStartMonth = (currentQuarter === 0 ? 3 : currentQuarter - 1) * 3;
  const previousQuarterEnd = new Date(previousQuarterYear, previousQuarterStartMonth + 3, 0);
  return {
    start: `${previousQuarterYear}${String(previousQuarterStartMonth + 1).padStart(2, '0')}01`,
    end: toDateKey(previousQuarterEnd),
  };
}

function isoFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isFullMonthRange(range: DashboardDateRange): boolean {
  const s = parseDateKey(range.start);
  const e = parseDateKey(range.end);
  if (!s || !e) return false;
  const lastDay = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();
  return (
    s.getDate() === 1 &&
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    e.getDate() === lastDay
  );
}

function isFullQuarterRange(range: DashboardDateRange): boolean {
  const s = parseDateKey(range.start);
  const e = parseDateKey(range.end);
  if (!s || !e) return false;
  const qStartMonth = Math.floor(s.getMonth() / 3) * 3;
  if (s.getDate() !== 1 || s.getMonth() !== qStartMonth) return false;
  const qEnd = new Date(s.getFullYear(), qStartMonth + 3, 0);
  return (
    e.getFullYear() === qEnd.getFullYear() &&
    e.getMonth() === qEnd.getMonth() &&
    e.getDate() === qEnd.getDate()
  );
}

function isFullYearRange(range: DashboardDateRange): boolean {
  const s = parseDateKey(range.start);
  const e = parseDateKey(range.end);
  if (!s || !e) return false;
  return (
    s.getMonth() === 0 && s.getDate() === 1 &&
    e.getMonth() === 11 && e.getDate() === 31 &&
    s.getFullYear() === e.getFullYear()
  );
}

function spanDays(range: DashboardDateRange): number {
  const s = parseDateKey(range.start);
  const e = parseDateKey(range.end);
  if (!s || !e) return 0;
  return Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
}

export interface DashboardRangeSelection {
  rangeType: DashboardRangeType;
  startDate: string;
  endDate: string;
}

/**
 * Shift a resolved range one period earlier (-1) or later (+1), stepping by the
 * period's own unit: a full quarter moves by a quarter, a full month by a month,
 * a full year by a year, and any rolling window (7d/30d/custom) by its own span.
 * `mtd`/`ytd` step to the previous/next full month/year. The result is an
 * anchored selection the dashboard can apply directly.
 */
export function shiftDashboardRange(
  rangeType: DashboardRangeType,
  range: DashboardDateRange,
  direction: -1 | 1,
): DashboardRangeSelection {
  const s = parseDateKey(range.start);
  const e = parseDateKey(range.end);
  if (!s || !e) return { rangeType, startDate: '', endDate: '' };

  if (isFullQuarterRange(range) || rangeType === 'quarter' || rangeType === 'lastquarter') {
    const qStartMonth = Math.floor(s.getMonth() / 3) * 3;
    const base = new Date(s.getFullYear(), qStartMonth + direction * 3, 1);
    const qEnd = new Date(base.getFullYear(), base.getMonth() + 3, 0);
    return { rangeType: 'custom', startDate: isoFromDate(base), endDate: isoFromDate(qEnd) };
  }

  if (isFullMonthRange(range) || rangeType === 'mtd' || rangeType === 'lastmonth' || rangeType === 'month') {
    const base = new Date(s.getFullYear(), s.getMonth() + direction, 1);
    return { rangeType: 'month', startDate: isoFromDate(base), endDate: '' };
  }

  if (isFullYearRange(range) || rangeType === 'ytd') {
    const year = s.getFullYear() + direction;
    return { rangeType: 'custom', startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  }

  // Rolling day window — slide it by its own width.
  const n = spanDays(range) || 1;
  const ns = new Date(s);
  ns.setDate(ns.getDate() + direction * n);
  const ne = new Date(e);
  ne.setDate(ne.getDate() + direction * n);
  return { rangeType: 'custom', startDate: isoFromDate(ns), endDate: isoFromDate(ne) };
}

/** A friendly label for a resolved range that lands on a calendar period. */
export function describeDashboardRange(range: DashboardDateRange): string | null {
  if (isFullQuarterRange(range)) {
    const s = parseDateKey(range.start)!;
    return `Q${Math.floor(s.getMonth() / 3) + 1} ${s.getFullYear()}`;
  }
  if (isFullYearRange(range)) {
    return String(parseDateKey(range.start)!.getFullYear());
  }
  if (isFullMonthRange(range)) {
    return parseDateKey(range.start)!.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  return null;
}

export function isDateInDashboardRange(date: string, range: DashboardDateRange): boolean {
  return (!range.start || date >= range.start) && (!range.end || date <= range.end);
}

export function filterDashboardSummaries(
  summaries: DailySummary[],
  range: DashboardDateRange,
): DailySummary[] {
  return summaries.filter((summary) => isDateInDashboardRange(summary.date, range));
}

import type { DailySummary } from './aggregator';

export type DashboardRangeType =
  | '7d'
  | '30d'
  | 'quarter'
  | 'lastquarter'
  | 'lastmonth'
  | 'mtd'
  | 'ytd'
  | 'custom';

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

export function isDateInDashboardRange(date: string, range: DashboardDateRange): boolean {
  return (!range.start || date >= range.start) && (!range.end || date <= range.end);
}

export function filterDashboardSummaries(
  summaries: DailySummary[],
  range: DashboardDateRange,
): DailySummary[] {
  return summaries.filter((summary) => isDateInDashboardRange(summary.date, range));
}

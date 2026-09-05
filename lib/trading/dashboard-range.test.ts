import { describe, expect, it } from 'vitest';
import type { DailySummary } from './aggregator';
import {
  filterDashboardSummaries,
  resolveDashboardDateRange,
} from './dashboard-range';

describe('dashboard date range', () => {
  const now = new Date(2026, 7, 31, 12);

  it('resolves each relative period from the latest historical trading day', () => {
    expect(resolveDashboardDateRange('7d', '20260526', '', '', now)).toEqual({
      start: '20260520',
      end: '20260526',
    });
    expect(resolveDashboardDateRange('30d', '20260526', '', '', now)).toEqual({
      start: '20260427',
      end: '20260526',
    });
    expect(resolveDashboardDateRange('mtd', '20260526', '', '', now)).toEqual({
      start: '20260501',
      end: '20260526',
    });
    expect(resolveDashboardDateRange('ytd', '20260526', '', '', now)).toEqual({
      start: '20260101',
      end: '20260526',
    });
    expect(resolveDashboardDateRange('quarter', '20260526', '', '', now)).toEqual({
      start: '20260401',
      end: '20260630',
    });
    expect(resolveDashboardDateRange('lastquarter', '20260526', '', '', now)).toEqual({
      start: '20260101',
      end: '20260331',
    });
    expect(resolveDashboardDateRange('lastmonth', '20260526', '', '', now)).toEqual({
      start: '20260401',
      end: '20260430',
    });
  });

  it('handles a previous-quarter range across a year boundary', () => {
    expect(resolveDashboardDateRange('lastquarter', '20260115', '', '', now)).toEqual({
      start: '20251001',
      end: '20251231',
    });
  });

  it('handles last month across a year boundary', () => {
    expect(resolveDashboardDateRange('lastmonth', '20260115', '', '', now)).toEqual({
      start: '20251201',
      end: '20251231',
    });
  });

  it("resolves a specific calendar month from the anchor's first day", () => {
    const range = resolveDashboardDateRange('month', '20260526', '2026-04-01', '', now);
    expect(range).toEqual({ start: '20260401', end: '20260430' });
  });

  it('normalizes custom dates and includes only matching summaries', () => {
    const range = resolveDashboardDateRange(
      'custom',
      '20260526',
      '2026-05-10',
      '2026-05-20',
      now,
    );
    const summaries = ['20260521', '20260520', '20260510', '20260509']
      .map((date) => ({ date }) as DailySummary);

    expect(range).toEqual({ start: '20260510', end: '20260520' });
    expect(filterDashboardSummaries(summaries, range).map((summary) => summary.date)).toEqual([
      '20260520',
      '20260510',
    ]);
  });
});

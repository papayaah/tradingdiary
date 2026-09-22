import { describe, expect, it } from 'vitest';
import {
  computeReportMetrics,
  computeBreakdown,
  dimensionKey,
  type ReportTrade,
} from './report-metrics';

let seq = 0;
function trade(overrides: Partial<ReportTrade> = {}): ReportTrade {
  const netPnL = overrides.netPnL ?? 0;
  return {
    key: `k${seq++}`,
    symbol: 'AAPL',
    side: 'LONG',
    tradingDay: '20260914',
    firstTradeTime: '09:30:00',
    netPnL,
    grossPnL: netPnL, // default: no commissions
    totalCommissions: 0,
    volume: 100,
    isOpen: false,
    currency: 'USD',
    accountId: 'a1',
    accountName: 'Main',
    ...overrides,
  };
}

describe('computeReportMetrics', () => {
  it('computes win rate, averages, payoff, profit factor, and expectancy', () => {
    const m = computeReportMetrics([
      trade({ netPnL: 100 }),
      trade({ netPnL: 200 }),
      trade({ netPnL: -50 }),
      trade({ netPnL: -50 }),
    ]);
    expect(m.tradeCount).toBe(4);
    expect(m.winCount).toBe(2);
    expect(m.lossCount).toBe(2);
    expect(m.winRate).toBe(50);
    expect(m.netPnL).toBe(200);
    expect(m.avgWin).toBe(150);
    expect(m.avgLoss).toBe(-50);
    expect(m.payoffRatio).toBeCloseTo(3);
    expect(m.profitFactor).toBeCloseTo(300 / 100); // 3
    expect(m.expectancy).toBe(50); // 200 / 4
    expect(m.largestWin).toBe(200);
    expect(m.largestLoss).toBe(-50);
  });

  it('excludes open trades from realized metrics but counts them', () => {
    const m = computeReportMetrics([
      trade({ netPnL: 100 }),
      trade({ isOpen: true, netPnL: 0 }),
    ]);
    expect(m.tradeCount).toBe(1);
    expect(m.openCount).toBe(1);
    expect(m.netPnL).toBe(100);
  });

  it('returns null ratios when there are no losses', () => {
    const m = computeReportMetrics([trade({ netPnL: 100 }), trade({ netPnL: 50 })]);
    expect(m.profitFactor).toBeNull();
    expect(m.payoffRatio).toBeNull();
    expect(m.winRate).toBe(100);
  });

  it('tracks the worst drawdown and longest streaks in realization order', () => {
    // +100, +100, -300 (peak 200 → -100 dd), -50, +80
    const m = computeReportMetrics([
      trade({ tradingDay: '20260901', firstTradeTime: '09:00:00', netPnL: 100 }),
      trade({ tradingDay: '20260901', firstTradeTime: '10:00:00', netPnL: 100 }),
      trade({ tradingDay: '20260902', firstTradeTime: '09:00:00', netPnL: -300 }),
      trade({ tradingDay: '20260903', firstTradeTime: '09:00:00', netPnL: -50 }),
      trade({ tradingDay: '20260904', firstTradeTime: '09:00:00', netPnL: 80 }),
    ]);
    expect(m.maxDrawdown).toBe(-350); // peak +200 → trough -150
    expect(m.maxWinStreak).toBe(2);
    expect(m.maxLossStreak).toBe(2);
  });

  it('separates gross from net using commissions', () => {
    const m = computeReportMetrics([
      trade({ netPnL: 92.68, grossPnL: 100, totalCommissions: -7.32 }),
    ]);
    expect(m.netPnL).toBeCloseTo(92.68);
    expect(m.grossPnL).toBeCloseTo(100);
    expect(m.commissions).toBeCloseTo(7.32);
  });
});

describe('computeBreakdown', () => {
  it('groups by dimension and sorts by net P&L descending', () => {
    const rows = computeBreakdown(
      [
        trade({ symbol: 'AAPL', netPnL: 100 }),
        trade({ symbol: 'AAPL', netPnL: -20 }),
        trade({ symbol: 'TSLA', netPnL: 500 }),
      ],
      'symbol',
    );
    expect(rows.map((r) => r.key)).toEqual(['TSLA', 'AAPL']);
    expect(rows[0].metrics.netPnL).toBe(500);
    expect(rows[1].metrics.netPnL).toBe(80);
  });

  it('derives weekday and hour dimension keys', () => {
    expect(dimensionKey(trade({ tradingDay: '20260914' }), 'weekday')).toBe('Monday');
    expect(dimensionKey(trade({ firstTradeTime: '14:05:00' }), 'hour')).toBe('14:00');
    expect(dimensionKey(trade({ tradingDay: '20260914' }), 'month')).toBe('2026-09');
  });
});

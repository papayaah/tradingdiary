import { describe, expect, it } from 'vitest';
import {
  buildDashboardDaySummaries,
  type DashboardTradeGroupRow,
} from './dashboard-summaries';

function group(
  overrides: Partial<DashboardTradeGroupRow> = {},
): DashboardTradeGroupRow {
  return {
    clientKey: 'group-1',
    symbol: 'NVDA',
    companyName: 'NVIDIA',
    currency: 'USD',
    accountCurrency: 'USD',
    side: 'LONG',
    openedDate: '20260914',
    openedTime: '09:30:00',
    closedDate: '20260914',
    closedTime: '10:00:00',
    tradingDay: '20260914',
    volume: 20,
    grossPnL: 100,
    totalCommissions: 2,
    netPnL: 98,
    nativeGrossPnL: 100,
    nativeTotalCommissions: 2,
    nativeNetPnL: 98,
    isOpen: false,
    netQuantity: 0,
    openAvgCost: 0,
    fxRateToAccount: 1,
    fxRateDate: '20260914',
    ...overrides,
  };
}

describe('server dashboard summaries', () => {
  it('builds descending daily totals from bounded trade-group rows', () => {
    const summaries = buildDashboardDaySummaries([
      group(),
      group({
        clientKey: 'group-2',
        symbol: 'AMD',
        openedTime: '11:00:00',
        closedTime: '11:15:00',
        volume: 10,
        grossPnL: -40,
        totalCommissions: 1,
        netPnL: -41,
        nativeGrossPnL: -40,
        nativeTotalCommissions: 1,
        nativeNetPnL: -41,
      }),
      group({
        clientKey: 'group-3',
        tradingDay: '20260915',
        openedDate: '20260915',
        closedDate: '20260915',
        netPnL: 12,
      }),
    ]);

    expect(summaries.map((summary) => summary.date)).toEqual(['20260915', '20260914']);
    expect(summaries[1]).toMatchObject({
      totalTrades: 2,
      totalVolume: 30,
      winCount: 1,
      lossCount: 1,
      winRate: 50,
      grossPnL: 60,
      totalCommissions: 3,
      netPnL: 57,
      totalPnL: 57,
    });
    expect(summaries[1].trades.map((trade) => trade.holdMinutes)).toEqual([30, 15]);
  });

  it('keeps open positions visible without classifying them as wins or losses', () => {
    const [summary] = buildDashboardDaySummaries([
      group({
        closedDate: null,
        closedTime: null,
        isOpen: true,
        grossPnL: 0,
        netPnL: -1,
        totalCommissions: 1,
        netQuantity: 5,
        openAvgCost: 20,
      }),
    ]);

    expect(summary.totalTrades).toBe(1);
    expect(summary.winCount).toBe(0);
    expect(summary.lossCount).toBe(0);
    expect(summary.trades[0]).toMatchObject({
      isOpen: true,
      netQuantity: 5,
      openAvgCost: 20,
      holdMinutes: 0,
    });
  });
});

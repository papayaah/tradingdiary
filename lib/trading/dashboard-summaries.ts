import type { AggregatedTrade, DailySummary } from './aggregator';

export interface DashboardTradeGroupRow {
  clientKey: string;
  symbol: string;
  companyName: string;
  currency: string;
  accountCurrency: string;
  side: string;
  openedDate: string;
  openedTime: string;
  closedDate: string | null;
  closedTime: string | null;
  tradingDay: string;
  volume: number;
  grossPnL: number;
  totalCommissions: number;
  netPnL: number;
  nativeGrossPnL: number;
  nativeTotalCommissions: number;
  nativeNetPnL: number;
  isOpen: boolean;
  netQuantity: number;
  openAvgCost: number;
  fxRateToAccount: number | null;
  fxRateDate: string | null;
}

function formattedTradingDay(dateKey: string): string {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(4, 6)) - 1;
  const day = Number(dateKey.slice(6, 8));
  return new Date(year, month, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function timestamp(dateKey: string, time: string): number {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(4, 6)) - 1;
  const day = Number(dateKey.slice(6, 8));
  const [hour = 0, minute = 0, second = 0] = time.split(':').map(Number);
  return Date.UTC(year, month, day, hour, minute, second);
}

function holdMinutes(row: DashboardTradeGroupRow): number {
  if (!row.closedDate || !row.closedTime) return 0;
  return Math.max(
    0,
    (timestamp(row.closedDate, row.closedTime) - timestamp(row.openedDate, row.openedTime)) / 60_000,
  );
}

function toTrade(row: DashboardTradeGroupRow): AggregatedTrade {
  return {
    groupKey: row.clientKey,
    symbol: row.symbol,
    companyName: row.companyName,
    date: row.tradingDay,
    firstTradeTime: row.openedTime,
    currency: row.currency,
    accountCurrency: row.accountCurrency,
    nativeGrossPnL: row.nativeGrossPnL,
    nativeTotalCommissions: row.nativeTotalCommissions,
    nativeNetPnL: row.nativeNetPnL,
    fxRateToAccount: row.fxRateToAccount ?? undefined,
    fxRateDate: row.fxRateDate ?? undefined,
    volume: row.volume,
    executions: 0,
    grossPnL: row.grossPnL,
    totalCommissions: row.totalCommissions,
    netPnL: row.netPnL,
    side: row.side === 'SHORT' ? 'SHORT' : 'LONG',
    isOpen: row.isOpen,
    netQuantity: row.netQuantity,
    openAvgCost: row.openAvgCost,
    holdMinutes: holdMinutes(row),
  };
}

/** Convert the bounded Postgres trade-group range into the dashboard contract. */
export function buildDashboardDaySummaries(rows: DashboardTradeGroupRow[]): DailySummary[] {
  const byDay = new Map<string, AggregatedTrade[]>();
  for (const row of rows) {
    const trades = byDay.get(row.tradingDay) ?? [];
    trades.push(toTrade(row));
    byDay.set(row.tradingDay, trades);
  }

  return [...byDay.entries()]
    .map(([date, trades]) => {
      trades.sort((a, b) => a.firstTradeTime.localeCompare(b.firstTradeTime));
      const tradesWithPnL = trades.filter(
        (trade) => !trade.isOpen || Math.abs(trade.grossPnL) > 0.01,
      );
      const winCount = tradesWithPnL.filter((trade) => trade.netPnL > 0).length;
      const lossCount = tradesWithPnL.filter((trade) => trade.netPnL < 0).length;
      const totalCommissions = trades.reduce((sum, trade) => sum + trade.totalCommissions, 0);
      const grossPnL = trades.reduce((sum, trade) => sum + trade.grossPnL, 0);
      const netPnL = trades.reduce((sum, trade) => sum + trade.netPnL, 0);

      return {
        date,
        formattedDate: formattedTradingDay(date),
        trades,
        totalTrades: trades.length,
        totalVolume: trades.reduce((sum, trade) => sum + trade.volume, 0),
        winCount,
        lossCount,
        winRate: tradesWithPnL.length > 0 ? (winCount / tradesWithPnL.length) * 100 : 0,
        totalCommissions,
        grossPnL,
        netPnL,
        totalPnL: netPnL,
      } satisfies DailySummary;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

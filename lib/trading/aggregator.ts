import type { TransactionRecord } from '../db/schema';

export interface AggregatedTrade {
  symbol: string;
  companyName: string;
  date: string;
  firstTradeTime: string;
  volume: number;
  executions: number;
  grossPnL: number;
  totalCommissions: number;
  netPnL: number;
  side: 'LONG' | 'SHORT';
  isOpen: boolean;
  netQuantity: number;
  transactions: TransactionRecord[];
}

export interface DailySummary {
  date: string;
  formattedDate: string;
  trades: AggregatedTrade[];
  totalTrades: number;
  totalVolume: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  totalCommissions: number;
  grossPnL: number;
  netPnL: number;
}

function formatTradeDate(dateStr: string): string {
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  const date = new Date(year, month, day);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function timeToMinutes(time: string): number {
  const [h, m, s] = time.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

export function aggregateByDay(transactions: TransactionRecord[]): DailySummary[] {
  const byDateSymbol = new Map<string, TransactionRecord[]>();

  for (const t of transactions) {
    const key = `${t.date}|${t.symbol}`;
    const existing = byDateSymbol.get(key);
    if (existing) {
      existing.push(t);
    } else {
      byDateSymbol.set(key, [t]);
    }
  }

  const byDate = new Map<string, AggregatedTrade[]>();

  for (const [key, txns] of byDateSymbol) {
    const [date] = key.split('|');
    const sorted = txns.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

    const firstEntry = sorted.find(
      (t) => t.side === 'BUYTOOPEN' || t.side === 'SELLTOOPEN'
    );
    const side: 'LONG' | 'SHORT' =
      firstEntry?.side === 'SELLTOOPEN' ? 'SHORT' : 'LONG';

    const volume = sorted.reduce((sum, t) => sum + Math.abs(t.quantity), 0);
    const netQuantity = sorted.reduce((sum, t) => sum + t.quantity, 0);
    const sumTotalValue = sorted.reduce((sum, t) => sum + t.totalValue, 0);
    const sumCommissions = sorted.reduce((sum, t) => sum + t.commission, 0);

    const grossPnL = -sumTotalValue;
    const netPnL = grossPnL + sumCommissions;

    const trade: AggregatedTrade = {
      symbol: sorted[0].symbol,
      companyName: sorted[0].companyName,
      date,
      firstTradeTime: sorted[0].time,
      volume,
      executions: sorted.length,
      grossPnL,
      totalCommissions: sumCommissions,
      netPnL,
      side,
      isOpen: Math.abs(netQuantity) > 0.01,
      netQuantity: Math.round(netQuantity * 100) / 100,
      transactions: sorted,
    };

    const existing = byDate.get(date);
    if (existing) {
      existing.push(trade);
    } else {
      byDate.set(date, [trade]);
    }
  }

  const summaries: DailySummary[] = [];

  for (const [date, trades] of byDate) {
    const sorted = trades.sort(
      (a, b) => timeToMinutes(a.firstTradeTime) - timeToMinutes(b.firstTradeTime)
    );

    const closedTrades = sorted.filter((t) => !t.isOpen);
    const winCount = closedTrades.filter((t) => t.netPnL > 0).length;
    const lossCount = closedTrades.filter((t) => t.netPnL < 0).length;

    summaries.push({
      date,
      formattedDate: formatTradeDate(date),
      trades: sorted,
      totalTrades: sorted.length,
      totalVolume: sorted.reduce((sum, t) => sum + t.volume, 0),
      winCount,
      lossCount,
      winRate: closedTrades.length > 0 ? (winCount / closedTrades.length) * 100 : 0,
      totalCommissions: closedTrades.reduce((sum, t) => sum + t.totalCommissions, 0),
      grossPnL: closedTrades.reduce((sum, t) => sum + t.grossPnL, 0),
      netPnL: closedTrades.reduce((sum, t) => sum + t.netPnL, 0),
    });
  }

  return summaries.sort((a, b) => b.date.localeCompare(a.date));
}

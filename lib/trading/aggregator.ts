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
  openAvgCost: number;
  unrealizedPnL?: number;
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

function nextCalendarDay(dateStr: string): string {
  const y = parseInt(dateStr.substring(0, 4));
  const m = parseInt(dateStr.substring(4, 6)) - 1;
  const d = parseInt(dateStr.substring(6, 8));
  const next = new Date(y, m, d);
  next.setDate(next.getDate() + 1);
  return `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}${String(next.getDate()).padStart(2, '0')}`;
}

function effectiveDate(t: TransactionRecord, cutoffTime?: string | null): string {
  if (!cutoffTime) return t.date;
  if (t.time >= cutoffTime) return nextCalendarDay(t.date);
  return t.date;
}

interface FIFOResult {
  realizedGross: number;
  realizedCommission: number;
  openQuantity: number;
  openAvgCost: number;
}

/**
 * FIFO matching: match closing transactions against opening transactions
 * in chronological order to compute realized P&L.
 *
 * For LONG trades: opening = BUYTOOPEN, closing = SELLTOCLOSE
 * For SHORT trades: opening = SELLTOOPEN, closing = BUYTOCLOSE
 */
function computeRealizedPnL(transactions: TransactionRecord[]): FIFOResult {
  // Build a queue of opening lots: { qty (always positive), price, totalValue, commission }
  const openLots: { qty: number; costPerShare: number; commission: number }[] = [];
  let realizedGross = 0;
  let realizedCommission = 0;

  for (const t of transactions) {
    const isOpening = t.side === 'BUYTOOPEN' || t.side === 'SELLTOOPEN';
    const qty = Math.abs(t.quantity);

    if (isOpening) {
      // Add to the FIFO queue
      openLots.push({
        qty,
        costPerShare: Math.abs(t.totalValue) / qty,
        commission: t.commission,
      });
    } else {
      // Closing transaction — match against open lots FIFO
      let remaining = qty;
      const closePrice = Math.abs(t.totalValue) / qty;
      // Proportion of this close's commission allocated so far
      let commAllocated = 0;

      while (remaining > 0.001 && openLots.length > 0) {
        const lot = openLots[0];
        const matched = Math.min(remaining, lot.qty);
        const fraction = matched / qty;

        // For LONG: realized = (sell price - buy price) * matched
        // For SHORT: realized = (open sell price - close buy price) * matched
        // Both simplify to: proceeds - cost
        const isLong = t.side === 'SELLTOCLOSE';
        if (isLong) {
          realizedGross += (closePrice - lot.costPerShare) * matched;
        } else {
          // SHORT: BUYTOCLOSE — profit when open price > close price
          realizedGross += (lot.costPerShare - closePrice) * matched;
        }

        // Allocate commissions proportionally
        const lotFraction = matched / (matched + (lot.qty - matched));
        realizedCommission += lot.commission * lotFraction;
        lot.commission -= lot.commission * lotFraction;

        commAllocated += fraction;

        lot.qty -= matched;
        remaining -= matched;

        if (lot.qty < 0.001) {
          openLots.shift();
        }
      }

      // Add closing transaction's commission
      realizedCommission += t.commission;
    }
  }

  const openQuantity = openLots.reduce((sum, lot) => sum + lot.qty, 0);
  const openTotalCost = openLots.reduce((sum, lot) => sum + lot.qty * lot.costPerShare, 0);
  const openAvgCost = openQuantity > 0.001 ? openTotalCost / openQuantity : 0;

  return { realizedGross, realizedCommission, openQuantity, openAvgCost };
}

export function aggregateByDay(
  transactions: TransactionRecord[],
  cutoffTime?: string | null
): DailySummary[] {
  const byDateSymbol = new Map<string, TransactionRecord[]>();

  for (const t of transactions) {
    const eDate = effectiveDate(t, cutoffTime);
    const key = `${eDate}|${t.symbol}`;
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

    // FIFO matching for realized P&L
    const fifo = computeRealizedPnL(sorted);
    const grossPnL = fifo.realizedGross;
    const netPnL = grossPnL + fifo.realizedCommission;

    const trade: AggregatedTrade = {
      symbol: sorted[0].symbol,
      companyName: sorted[0].companyName,
      date,
      firstTradeTime: sorted[0].time,
      volume,
      executions: sorted.length,
      grossPnL,
      totalCommissions: fifo.realizedCommission,
      netPnL,
      side,
      isOpen: Math.abs(netQuantity) > 0.01,
      netQuantity: Math.round(netQuantity * 100) / 100,
      openAvgCost: fifo.openAvgCost,
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

    // Include all trades with realized P&L (including partially-open positions)
    const tradesWithPnL = sorted.filter(
      (t) => !t.isOpen || Math.abs(t.grossPnL) > 0.01
    );
    const winCount = tradesWithPnL.filter((t) => t.netPnL > 0).length;
    const lossCount = tradesWithPnL.filter((t) => t.netPnL < 0).length;

    summaries.push({
      date,
      formattedDate: formatTradeDate(date),
      trades: sorted,
      totalTrades: sorted.length,
      totalVolume: sorted.reduce((sum, t) => sum + t.volume, 0),
      winCount,
      lossCount,
      winRate: tradesWithPnL.length > 0 ? (winCount / tradesWithPnL.length) * 100 : 0,
      totalCommissions: sorted.reduce((sum, t) => sum + t.totalCommissions, 0),
      grossPnL: sorted.reduce((sum, t) => sum + t.grossPnL, 0),
      netPnL: sorted.reduce((sum, t) => sum + t.netPnL, 0),
    });
  }

  return summaries.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Apply market prices to compute unrealized P&L for open positions.
 * Uses historical closing prices so each day shows unrealized based on
 * that day's actual closing price.
 *
 * @param prices - Map of symbol → date → closing price
 *   e.g. { "U": { "20260224": 24.5, "20260225": 25.1 } }
 *   For the latest date, uses current market price if historical isn't available.
 * Mutates the trades in-place.
 */
export function applyMarketPrices(
  summaries: DailySummary[],
  prices: Record<string, Record<string, number>>
): void {
  for (const day of summaries) {
    for (const trade of day.trades) {
      if (!trade.isOpen) continue;
      const symbolPrices = prices[trade.symbol];
      if (!symbolPrices) continue;

      // Find the best price for this date:
      // 1. Exact date match
      // 2. Nearest earlier date (market was closed, use last close)
      let marketPrice: number | null = null;
      if (symbolPrices[day.date] != null) {
        marketPrice = symbolPrices[day.date];
      } else {
        // Find the closest earlier date with a price
        const availableDates = Object.keys(symbolPrices).sort();
        for (let i = availableDates.length - 1; i >= 0; i--) {
          if (availableDates[i] <= day.date) {
            marketPrice = symbolPrices[availableDates[i]];
            break;
          }
        }
      }

      if (marketPrice == null) continue;

      if (trade.side === 'LONG') {
        trade.unrealizedPnL = (marketPrice - trade.openAvgCost) * Math.abs(trade.netQuantity);
      } else {
        trade.unrealizedPnL = (trade.openAvgCost - marketPrice) * Math.abs(trade.netQuantity);
      }
    }
  }
}

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
  if (!dateStr || dateStr.length < 8) return dateStr;
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  if (isNaN(year) || isNaN(month) || isNaN(day)) return dateStr;
  const date = new Date(year, month, day);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function timeToMinutes(time: string): number {
  if (!time) return 0;
  const parts = time.split(':').map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const s = parts[2] || 0;
  if (isNaN(h) || isNaN(m) || isNaN(s)) return 0;
  return h * 3600 + m * 60 + s;
}

function nextTradingDay(dateStr: string): string {
  const y = parseInt(dateStr.substring(0, 4));
  const m = parseInt(dateStr.substring(4, 6)) - 1;
  const d = parseInt(dateStr.substring(6, 8));
  const next = new Date(y, m, d);
  do {
    next.setDate(next.getDate() + 1);
  } while (next.getDay() === 0 || next.getDay() === 6); // skip Sun/Sat
  return `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}${String(next.getDate()).padStart(2, '0')}`;
}

function effectiveDate(t: TransactionRecord, cutoffTime?: string | null): string {
  if (!cutoffTime) return t.date;
  if (t.time >= cutoffTime) return nextTradingDay(t.date);
  return t.date;
}

interface FIFOLot {
  qty: number;
  costPerShare: number;
  commission: number;
}

/**
 * Per-date accumulator for cross-day FIFO results.
 */
interface DateAccum {
  symbol: string;
  companyName: string;
  date: string;
  transactions: TransactionRecord[];
  realizedGross: number;
  realizedCommission: number;
  // Snapshot of the running position at the END of this date
  endPosition: number;
  endAvgCost: number;
  // The first opening side seen for this symbol (across all dates)
  side: 'LONG' | 'SHORT';
}

export function aggregateByDay(
  transactions: TransactionRecord[],
  cutoffTime?: string | null
): DailySummary[] {
  // ── Step 1: Group transactions by symbol ──
  const bySymbol = new Map<string, { t: TransactionRecord; eDate: string }[]>();

  for (const t of transactions) {
    const eDate = effectiveDate(t, cutoffTime);
    const existing = bySymbol.get(t.symbol);
    if (existing) {
      existing.push({ t, eDate });
    } else {
      bySymbol.set(t.symbol, [{ t, eDate }]);
    }
  }

  // ── Step 2: Cross-day FIFO per symbol ──
  const allDateAccums: DateAccum[] = [];

  for (const [symbol, entries] of bySymbol) {
    // Sort chronologically: by effective date, then by time within the day
    entries.sort((a, b) => {
      const dateCmp = a.eDate.localeCompare(b.eDate);
      if (dateCmp !== 0) return dateCmp;
      return timeToMinutes(a.t.time) - timeToMinutes(b.t.time);
    });

    // Determine overall side from the first opening transaction
    const firstOpening = entries.find(
      (e) => e.t.side === 'BUYTOOPEN' || e.t.side === 'SELLTOOPEN'
    );
    const side: 'LONG' | 'SHORT' =
      firstOpening?.t.side === 'SELLTOOPEN' ? 'SHORT' : 'LONG';

    // FIFO lot queue carried across all dates
    const openLots: FIFOLot[] = [];
    let runningPosition = 0;

    // Sub-group entries by effective date (preserving chronological order)
    const dateGroups: { date: string; items: { t: TransactionRecord; eDate: string }[] }[] = [];
    for (const entry of entries) {
      const last = dateGroups[dateGroups.length - 1];
      if (last && last.date === entry.eDate) {
        last.items.push(entry);
      } else {
        dateGroups.push({ date: entry.eDate, items: [entry] });
      }
    }

    for (const group of dateGroups) {
      let dayRealizedGross = 0;
      let dayRealizedCommission = 0;
      const dayTxns: TransactionRecord[] = [];

      for (const { t } of group.items) {
        dayTxns.push(t);
        const isOpening = t.side === 'BUYTOOPEN' || t.side === 'SELLTOOPEN';
        const qty = Math.abs(t.quantity);

        // If transaction has manual realized P&L, add it directly
        if (t.realizedPnL != null) {
          dayRealizedGross += t.realizedPnL;
        }

        if (isOpening && qty > 0) {
          openLots.push({
            qty,
            costPerShare: Math.abs(t.totalValue) / qty,
            commission: t.commission,
          });
          runningPosition += t.quantity;
        } else if (!isOpening && qty > 0) {
          // Closing transaction — match against open lots FIFO
          let remaining = qty;
          const closePrice = Math.abs(t.totalValue) / qty;

          while (remaining > 0.001 && openLots.length > 0) {
            const lot = openLots[0];
            const matched = Math.min(remaining, lot.qty);

            const isLong = t.side === 'SELLTOCLOSE';
            if (isLong) {
              dayRealizedGross += (closePrice - lot.costPerShare) * matched;
            } else {
              dayRealizedGross += (lot.costPerShare - closePrice) * matched;
            }

            // Allocate opening lot commission proportionally
            const lotFraction = matched / (matched + (lot.qty - matched));
            dayRealizedCommission += lot.commission * lotFraction;
            lot.commission -= lot.commission * lotFraction;

            lot.qty -= matched;
            remaining -= matched;

            if (lot.qty < 0.001) {
              openLots.shift();
            }
          }

          // Add closing transaction's commission
          dayRealizedCommission += t.commission;
          runningPosition += t.quantity;
        }
      }

      // Snapshot of open lots at end of this date
      const openQty = openLots.reduce((s, l) => s + l.qty, 0);
      const openCost = openLots.reduce((s, l) => s + l.qty * l.costPerShare, 0);

      allDateAccums.push({
        symbol,
        companyName: dayTxns[0].companyName,
        date: group.date,
        transactions: dayTxns,
        realizedGross: dayRealizedGross,
        realizedCommission: dayRealizedCommission,
        endPosition: Math.round(runningPosition * 100) / 100,
        endAvgCost: openQty > 0.001 ? openCost / openQty : 0,
        side,
      });
    }
  }

  // ── Step 3: Build AggregatedTrade per date+symbol ──
  const byDate = new Map<string, AggregatedTrade[]>();

  for (const acc of allDateAccums) {
    const volume = acc.transactions.reduce((s, t) => s + Math.abs(t.quantity), 0);
    const grossPnL = acc.realizedGross;
    const netPnL = grossPnL + acc.realizedCommission;

    const trade: AggregatedTrade = {
      symbol: acc.symbol,
      companyName: acc.companyName,
      date: acc.date,
      firstTradeTime: acc.transactions[0].time,
      volume,
      executions: acc.transactions.length,
      grossPnL,
      totalCommissions: acc.realizedCommission,
      netPnL,
      side: acc.side,
      isOpen: Math.abs(acc.endPosition) > 0.01,
      netQuantity: acc.endPosition,
      openAvgCost: acc.endAvgCost,
      transactions: acc.transactions,
    };

    const existing = byDate.get(acc.date);
    if (existing) {
      existing.push(trade);
    } else {
      byDate.set(acc.date, [trade]);
    }
  }

  // ── Step 4: Build DailySummary per date ──
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

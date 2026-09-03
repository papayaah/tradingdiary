import type { TransactionRecord } from '../db/schema';
import { tradingDayFor } from './trading-day';
import { splitIntoTradeGroups } from './trade-groups';

export interface AggregatedTrade {
  /** Stable flat-to-flat trade-group key (present when built by
   * aggregateTradeGroupsByDay); unique per round trip within a day+symbol. */
  groupKey?: string;
  symbol: string;
  companyName: string;
  date: string;
  firstTradeTime: string;
  currency?: string;
  accountCurrency?: string;
  nativeGrossPnL?: number;
  nativeTotalCommissions?: number;
  nativeNetPnL?: number;
  nativeUnrealizedPnL?: number;
  fxRateToAccount?: number;
  fxRateDate?: string;
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
  totalPnL: number;
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

interface FIFOLot {
  qty: number;
  entryPrice: number;
  multiplier: number;
  commission: number;
  commissionAccount: number;
}

function fxRate(t: TransactionRecord): number {
  const source = t.currency?.toUpperCase();
  const target = t.fxAccountCurrency?.toUpperCase();
  if (!source || !target || source === target) return 1;
  return t.fxRateToAccount && t.fxRateToAccount > 0 ? t.fxRateToAccount : 1;
}

/**
 * Effective cash-per-(qty×price) factor. IBKR's Flex report omits the contract
 * multiplier (futures point value, bond percent-of-par), so `price × qty` alone
 * mis-states P&L. Derive the true factor from the trade's own cash value:
 * |totalValue| / (qty × price). Yields 1 for shares, the point value for futures
 * (e.g. ¥100 for N225, HK$50 for HSI), and 0.01 for bonds — so realized P&L is in
 * real currency and matches the broker. Falls back to the reported multiplier.
 */
function contractFactor(t: TransactionRecord): number {
  const absQty = Math.abs(t.quantity);
  const absPrice = Math.abs(t.price);
  if (absQty > 0 && absPrice > 0 && t.totalValue) {
    return Math.abs(t.totalValue) / (absQty * absPrice);
  }
  return t.multiplier || 1;
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
  realizedGrossAccount: number;
  realizedCommissionAccount: number;
  unrealizedPnL?: number; // Capture imported value
  unrealizedPnLAccount?: number;
  // Snapshot of the running position at the END of this date
  endPosition: number;
  endAvgCost: number;
  // Direction of this day's trading in the symbol (derived per day).
  side: 'LONG' | 'SHORT';
}

/**
 * Direction of a single day's trading in one symbol. Prefer the day's first
 * opening fill (buy-to-open → long, sell-to-open → short). If the day only closes
 * a position carried in from a prior day, infer from the first close instead
 * (sell-to-close closes a long, buy-to-close closes a short).
 */
function deriveDaySide(txns: TransactionRecord[]): 'LONG' | 'SHORT' {
  const firstOpen = txns.find((t) => t.side === 'BUYTOOPEN' || t.side === 'SELLTOOPEN');
  if (firstOpen) return firstOpen.side === 'SELLTOOPEN' ? 'SHORT' : 'LONG';
  const firstClose = txns.find((t) => t.side === 'SELLTOCLOSE' || t.side === 'BUYTOCLOSE');
  if (firstClose) return firstClose.side === 'SELLTOCLOSE' ? 'LONG' : 'SHORT';
  return 'LONG';
}

export function aggregateByDay(
  transactions: TransactionRecord[]
): DailySummary[] {
  // ── Step 1: Group transactions by symbol ──
  const bySymbol = new Map<string, { t: TransactionRecord; eDate: string }[]>();

  for (const t of transactions) {
    // Attribute realized P&L to the broker's official trading day when we have it
    // (IBKR TradeDate) — this is what makes daily totals match IBKR's own reports
    // for overnight/foreign sessions. Otherwise derive it from the execution
    // timestamp with the exchange session roll.
    const eDate = t.tradeDate || tradingDayFor(t.date, t.time, t.symbol);
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
    // FIFO must follow TRUE execution order (raw file date+time), never the
    // trading-day date. The trading day only decides which day a realized amount
    // is *attributed* to — reordering the matching itself pairs closes with the
    // wrong lots and produces nonsensical P&L. Sort by raw timestamp here and
    // bucket each closing trade's realized P&L into its trading day below.
    entries.sort((a, b) => {
      const dateCmp = a.t.date.localeCompare(b.t.date);
      if (dateCmp !== 0) return dateCmp;
      return timeToMinutes(a.t.time) - timeToMinutes(b.t.time);
    });

    // Side is derived PER TRADING DAY (see the trade build below), never once per
    // symbol: a symbol shorted on one day and traded long on another must show the
    // correct side on each day's row. A single symbol-wide side would stamp the
    // first-ever opening's direction onto every later day.

    // FIFO lot queue carried across all dates
    const openLots: FIFOLot[] = [];
    let runningPosition = 0;

    // One accumulator per trading day, keyed by that day.
    const accumsByDate = new Map<string, DateAccum>();

    for (const { t, eDate } of entries) {
      let accum = accumsByDate.get(eDate);
      if (!accum) {
        accum = {
          symbol,
          companyName: t.companyName,
          date: eDate,
          transactions: [],
          realizedGross: 0,
          realizedCommission: 0,
          realizedGrossAccount: 0,
          realizedCommissionAccount: 0,
          unrealizedPnL: undefined,
          endPosition: 0,
          endAvgCost: 0,
          side: 'LONG', // placeholder; set per day at trade-build time
        };
        accumsByDate.set(eDate, accum);
        allDateAccums.push(accum);
      }

      accum.transactions.push(t);
      const isOpening = t.side === 'BUYTOOPEN' || t.side === 'SELLTOOPEN';
      const qty = Math.abs(t.quantity);

      // The broker's own realized P&L (IBKR FifoPnlRealized) is authoritative when
      // present: it uses the true cost basis of the full account history, so it is
      // correct even for positions opened before our import window — which our own
      // FIFO can't reconstruct. When present we use it and skip the FIFO estimate
      // below; commissions are still added separately (FifoPnlRealized is gross).
      const hasReportedRealized = t.realizedPnL != null;
      if (hasReportedRealized) {
        accum.realizedGross += t.realizedPnL!;
        accum.realizedGrossAccount += t.realizedPnL! * fxRate(t);
      }

      // Capture imported unrealized P&L
      if (t.unrealizedPnL != null) {
        accum.unrealizedPnL = t.unrealizedPnL;
        accum.unrealizedPnLAccount = t.unrealizedPnL * fxRate(t);
      }

      if (isOpening && qty > 0) {
        openLots.push({
          qty,
          entryPrice: Math.abs(t.price),
          multiplier: contractFactor(t),
          commission: t.commission,
          commissionAccount: t.commission * fxRate(t),
        });
        runningPosition += (t.side === 'BUYTOOPEN' ? qty : -qty);
      } else if (!isOpening && qty > 0) {
        // Closing transaction — match against open lots FIFO
        let remaining = qty;
        const closePrice = Math.abs(t.price);

        while (remaining > 0.001 && openLots.length > 0) {
          const lot = openLots[0];
          const matched = Math.min(remaining, lot.qty);

          // IBKR's FifoPnlRealized is already NET of commissions, so when it is
          // present we neither recompute the FIFO gross nor add commissions again
          // (that double-counted fees). We still consume lots for position tracking.
          if (!hasReportedRealized) {
            const isLong = t.side === 'SELLTOCLOSE';
            const matchedGross = isLong
              ? (closePrice - lot.entryPrice) * matched * lot.multiplier
              : (lot.entryPrice - closePrice) * matched * lot.multiplier;
            accum.realizedGross += matchedGross;
            // Realized profit is recognized using the closing execution day's rate.
            accum.realizedGrossAccount += matchedGross * fxRate(t);

            // Allocate opening lot commission proportionally.
            const lotFraction = matched / (matched + (lot.qty - matched));
            accum.realizedCommission += lot.commission * lotFraction;
            accum.realizedCommissionAccount += lot.commissionAccount * lotFraction;
            lot.commission -= lot.commission * lotFraction;
            lot.commissionAccount -= lot.commissionAccount * lotFraction;
          }

          lot.qty -= matched;
          remaining -= matched;

          if (lot.qty < 0.001) {
            openLots.shift();
          }
        }

        // Add closing transaction's commission (only when we computed gross
        // ourselves; IBKR's reported realized already includes it).
        if (!hasReportedRealized) {
          accum.realizedCommission += t.commission;
          accum.realizedCommissionAccount += t.commission * fxRate(t);
        }
        runningPosition += (t.side === 'BUYTOCLOSE' ? qty : -qty);
      }

      // Snapshot open-lot state after this trade. Since the trading day only
      // shifts dates forward (futures Globex roll), trading days are
      // non-decreasing in execution order, so the last write for a given day
      // reflects its end-of-day position.
      const openQty = openLots.reduce((s, l) => s + l.qty, 0);
      const openCost = openLots.reduce((s, l) => s + l.qty * l.entryPrice, 0);
      accum.endPosition = Math.round(runningPosition * 100) / 100;
      accum.endAvgCost = openQty > 0.001 ? openCost / openQty : 0;
    }
  }

  // ── Step 3: Build AggregatedTrade per date+symbol ──
  const byDate = new Map<string, AggregatedTrade[]>();

  for (const acc of allDateAccums) {
    const volume = acc.transactions.reduce((s, t) => s + Math.abs(t.quantity), 0);
    const nativeGrossPnL = acc.realizedGross;
    const nativeNetPnL = nativeGrossPnL + acc.realizedCommission;
    const grossPnL = acc.realizedGrossAccount;
    const netPnL = grossPnL + acc.realizedCommissionAccount;
    const representativeFx = [...acc.transactions]
      .reverse()
      .find((transaction) => transaction.fxRateToAccount != null);

    const trade: AggregatedTrade = {
      symbol: acc.symbol,
      companyName: acc.companyName,
      date: acc.date,
      firstTradeTime: acc.transactions[0].time,
      currency: acc.transactions[0]?.currency || 'USD',
      accountCurrency: representativeFx?.fxAccountCurrency ?? acc.transactions[0]?.currency ?? 'USD',
      nativeGrossPnL,
      nativeTotalCommissions: acc.realizedCommission,
      nativeNetPnL,
      nativeUnrealizedPnL: acc.unrealizedPnL,
      fxRateToAccount: representativeFx?.fxRateToAccount,
      fxRateDate: representativeFx?.fxRateDate,
      volume,
      executions: acc.transactions.length,
      grossPnL,
      totalCommissions: acc.realizedCommissionAccount,
      netPnL,
      unrealizedPnL: acc.unrealizedPnLAccount,
      side: deriveDaySide(acc.transactions),
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

  return buildDailySummaries(byDate);
}

/**
 * Build day summaries from trades already grouped by day. Trades within a day are
 * ordered by entry time (the per-day timeline); days are ordered newest first.
 */
function buildDailySummaries(byDate: Map<string, AggregatedTrade[]>): DailySummary[] {
  const summaries: DailySummary[] = [];

  for (const [date, trades] of byDate) {
    const sorted = trades.sort(
      (a, b) => timeToMinutes(a.firstTradeTime) - timeToMinutes(b.firstTradeTime)
    );

    // Include all trades with realized OR unrealized P&L
    const tradesWithPnL = sorted.filter(
      (t) => !t.isOpen || Math.abs(t.grossPnL) > 0.01 || (t.unrealizedPnL != null && Math.abs(t.unrealizedPnL) > 0.01)
    );
    const winCount = tradesWithPnL.filter((t) => (t.netPnL + (t.unrealizedPnL || 0)) > 0).length;
    const lossCount = tradesWithPnL.filter((t) => (t.netPnL + (t.unrealizedPnL || 0)) < 0).length;

    const netPnL = sorted.reduce((sum, t) => sum + t.netPnL, 0);
    const totalUnrealized = sorted.reduce((sum, t) => sum + (t.unrealizedPnL || 0), 0);

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
      netPnL,
      totalPnL: netPnL + totalUnrealized,
    });
  }

  return summaries.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Flat-to-flat day aggregation: each round trip is its own trade (see
 * docs/specs/flat-to-flat-trade-identity.md). Same-symbol round trips on one day
 * become separate rows ordered by entry time — the per-day trade timeline.
 */
export function aggregateTradeGroupsByDay(
  transactions: TransactionRecord[],
): DailySummary[] {
  const groups = splitIntoTradeGroups(transactions);
  const byDate = new Map<string, AggregatedTrade[]>();

  for (const g of groups) {
    // De-duplicate executions shared across a reversal's two legs.
    const seen = new Set<string>();
    const txns: TransactionRecord[] = [];
    for (const leg of g.legs) {
      if (seen.has(leg.transaction.tradeId)) continue;
      seen.add(leg.transaction.tradeId);
      txns.push(leg.transaction);
    }

    const trade: AggregatedTrade = {
      groupKey: g.key,
      symbol: g.symbol,
      companyName: g.companyName,
      date: g.tradingDay,
      firstTradeTime: g.openedTime,
      currency: g.currency,
      accountCurrency: g.accountCurrency,
      nativeGrossPnL: g.nativeGrossPnL,
      nativeTotalCommissions: g.nativeTotalCommissions,
      nativeNetPnL: g.nativeNetPnL,
      fxRateToAccount: g.fxRateToAccount,
      fxRateDate: g.fxRateDate,
      volume: g.volume,
      executions: g.executions,
      grossPnL: g.grossPnL,
      totalCommissions: g.totalCommissions,
      netPnL: g.netPnL,
      side: g.side,
      isOpen: g.isOpen,
      netQuantity: g.netQuantity,
      openAvgCost: g.openAvgCost,
      transactions: txns,
    };

    const arr = byDate.get(g.tradingDay);
    if (arr) arr.push(trade);
    else byDate.set(g.tradingDay, [trade]);
  }

  return buildDailySummaries(byDate);
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

      const multiplier = trade.transactions[0]?.multiplier || 1;

      const nativeUnrealized = trade.side === 'LONG'
        ? (marketPrice - trade.openAvgCost) * Math.abs(trade.netQuantity) * multiplier
        : (trade.openAvgCost - marketPrice) * Math.abs(trade.netQuantity) * multiplier;
      trade.nativeUnrealizedPnL = nativeUnrealized;
      trade.unrealizedPnL = nativeUnrealized * (trade.fxRateToAccount ?? 1);
    }
  }
}

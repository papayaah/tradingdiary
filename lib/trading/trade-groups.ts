import type { TransactionRecord } from '../db/schema';
import { tradingDayFor } from './trading-day';
import { compareExecutionOrder } from './execution-order';

/**
 * Flat-to-flat trade identity.
 *
 * A trade is one round trip: a position that opens from flat (0) and closes back
 * to flat. Scaling in and out happens *inside* one trade; only crossing zero
 * starts a new trade. See docs/specs/flat-to-flat-trade-identity.md.
 *
 * This replaces the date+symbol grouping in aggregator.ts (which merged distinct
 * round trips into one row). The FIFO matching, commission allocation, and FX
 * handling mirror aggregator.ts so day/symbol totals reconcile exactly.
 */

/** One execution's contribution to a trade group. A reversal fill contributes a
 * `close` leg to the trade it closes and an `open` leg to the trade it opens, so
 * `quantity` is the portion of the source transaction attributed to this group
 * (its absolute value); the two legs' quantities sum to the full fill. */
export interface TradeLeg {
  transaction: TransactionRecord;
  quantity: number;
  role: 'open' | 'close';
}

export interface TradeGroup {
  /** Deterministic content key for idempotent re-splitting; the persistence
   * layer maps this to a stable UUID. Never used as the durable identity. */
  key: string;
  accountId: string;
  symbol: string;
  companyName: string;
  currency: string;
  accountCurrency: string;
  side: 'LONG' | 'SHORT';
  legs: TradeLeg[];
  /** Raw execution timestamp of the first opening fill (YYYYMMDD / HH:MM:SS). */
  openedDate: string;
  openedTime: string;
  /** Raw execution timestamp of the fill that returned the position to flat;
   * undefined while the trade is still open. */
  closedDate?: string;
  closedTime?: string;
  /** Cutoff-adjusted day the trade is attributed to (its opening day). */
  tradingDay: string;
  entryAvgPrice: number;
  exitAvgPrice: number;
  /** Peak absolute position reached during the trade. */
  maxPosition: number;
  volume: number;
  executions: number;
  // Account-currency P&L.
  grossPnL: number;
  totalCommissions: number;
  netPnL: number;
  // Native (instrument-currency) P&L.
  nativeGrossPnL: number;
  nativeTotalCommissions: number;
  nativeNetPnL: number;
  isOpen: boolean;
  /** Signed remaining position (0 when closed). */
  netQuantity: number;
  /** Native average cost of the remaining open lots (for unrealized P&L). */
  openAvgCost: number;
  fxRateToAccount?: number;
  fxRateDate?: string;
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

function fxRate(t: TransactionRecord): number {
  const source = t.currency?.toUpperCase();
  const target = t.fxAccountCurrency?.toUpperCase();
  if (!source || !target || source === target) return 1;
  return t.fxRateToAccount && t.fxRateToAccount > 0 ? t.fxRateToAccount : 1;
}

/** A FIFO lot open within a single trade group. Carries the account-currency
 * commission alongside the native commission so proportional allocation matches
 * aggregator.ts. */
interface FIFOLot {
  qty: number;
  entryPrice: number;
  multiplier: number;
  commission: number;
  commissionAccount: number;
}

/** Mutable state accumulated while a trade group is open. */
interface GroupBuilder {
  accountId: string;
  symbol: string;
  companyName: string;
  currency: string;
  side: 'LONG' | 'SHORT';
  legs: TradeLeg[];
  openedDate: string;
  openedTime: string;
  tradingDay: string;
  openLots: FIFOLot[];
  realizedGross: number;
  realizedCommission: number;
  realizedGrossAccount: number;
  realizedCommissionAccount: number;
  openQtyTotal: number;   // sum of opening leg quantities (for entry avg)
  openCostTotal: number;  // sum of opening qty*price (for entry avg)
  closeQtyTotal: number;  // sum of closing leg quantities (for exit avg)
  closeCostTotal: number; // sum of closing qty*price (for exit avg)
  maxPosition: number;
  seq: number;
}

/**
 * Split a transaction stream into flat-to-flat trade groups.
 *
 * Executions are grouped per account+symbol, walked in true execution order
 * (raw date+time). A new group opens when the running position leaves 0 and
 * closes when it returns to 0. A fill that crosses zero (a reversal) is split at
 * the crossing: the portion that reaches flat closes the current group, the
 * remainder opens a new group on the opposite side.
 */
export function splitIntoTradeGroups(
  transactions: TransactionRecord[],
): TradeGroup[] {
  // Group by account+symbol — a round trip is a position in one instrument in
  // one account.
  const byKey = new Map<string, TransactionRecord[]>();
  for (const t of transactions) {
    const key = `${t.accountId}${t.symbol}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(t);
    else byKey.set(key, [t]);
  }

  const groups: TradeGroup[] = [];

  for (const [, entries] of byKey) {
    // Deterministic total order: same-second fills tie-break on the broker
    // transaction id (tradeId) so the position walk — and therefore each group's
    // side — never depends on array/query order.
    entries.sort((a, b) => compareExecutionOrder(a, b, a.tradeId, b.tradeId));

    let runningPosition = 0;
    let builder: GroupBuilder | null = null;
    let seqForKey = 0;

    const startGroup = (t: TransactionRecord, opening: boolean): GroupBuilder => ({
      accountId: t.accountId,
      symbol: t.symbol,
      companyName: t.companyName,
      currency: t.currency || 'USD',
      // The side is set from the first opening chunk below.
      side: opening ? 'LONG' : 'LONG',
      legs: [],
      openedDate: t.date,
      openedTime: t.time,
      tradingDay: tradingDayFor(t.date, t.time, t.symbol),
      openLots: [],
      realizedGross: 0,
      realizedCommission: 0,
      realizedGrossAccount: 0,
      realizedCommissionAccount: 0,
      openQtyTotal: 0,
      openCostTotal: 0,
      closeQtyTotal: 0,
      closeCostTotal: 0,
      maxPosition: 0,
      seq: seqForKey++,
    });

    for (const t of entries) {
      const isBuy = t.side.startsWith('BUY');
      const dir = isBuy ? 1 : -1;
      const fullQty = Math.abs(t.quantity);
      if (fullQty <= 0) continue;

      const rate = fxRate(t);
      const price = Math.abs(t.price);
      const multiplier = t.multiplier || 1;
      let remaining = fullQty;

      while (remaining > 1e-9) {
        // Start a fresh group whenever we are flat.
        if (builder === null) {
          builder = startGroup(t, true);
          builder.side = isBuy ? 'LONG' : 'SHORT';
        }

        const reducing = runningPosition !== 0 && Math.sign(dir) !== Math.sign(runningPosition);
        // How much of this fill applies before the position changes regime
        // (reaches flat). A non-crossing chunk consumes the whole remainder.
        const chunkQty = reducing
          ? Math.min(remaining, Math.abs(runningPosition))
          : remaining;

        // Commission for this chunk, proportional to its share of the fill.
        const chunkFraction = chunkQty / fullQty;
        const chunkCommission = t.commission * chunkFraction;

        if (reducing) {
          // Closing leg — match against the group's open lots FIFO.
          let toMatch = chunkQty;
          const isLong = builder.side === 'LONG';
          while (toMatch > 1e-9 && builder.openLots.length > 0) {
            const lot = builder.openLots[0];
            const matched = Math.min(toMatch, lot.qty);
            const matchedGross = isLong
              ? (price - lot.entryPrice) * matched * lot.multiplier
              : (lot.entryPrice - price) * matched * lot.multiplier;
            builder.realizedGross += matchedGross;
            builder.realizedGrossAccount += matchedGross * rate;

            const lotFraction = matched / lot.qty;
            builder.realizedCommission += lot.commission * lotFraction;
            builder.realizedCommissionAccount += lot.commissionAccount * lotFraction;
            lot.commission -= lot.commission * lotFraction;
            lot.commissionAccount -= lot.commissionAccount * lotFraction;
            lot.qty -= matched;
            toMatch -= matched;
            if (lot.qty < 1e-9) builder.openLots.shift();
          }
          builder.realizedCommission += chunkCommission;
          builder.realizedCommissionAccount += chunkCommission * rate;
          builder.closeQtyTotal += chunkQty;
          builder.closeCostTotal += chunkQty * price;
          builder.legs.push({ transaction: t, quantity: chunkQty, role: 'close' });
        } else {
          // Opening leg (scale-in or initial entry) — push a lot.
          builder.openLots.push({
            qty: chunkQty,
            entryPrice: price,
            multiplier,
            commission: chunkCommission,
            commissionAccount: chunkCommission * rate,
          });
          builder.openQtyTotal += chunkQty;
          builder.openCostTotal += chunkQty * price;
          builder.legs.push({ transaction: t, quantity: chunkQty, role: 'open' });
        }

        runningPosition += dir * chunkQty;
        builder.maxPosition = Math.max(builder.maxPosition, Math.abs(runningPosition));
        remaining -= chunkQty;

        // Returned to flat → finalize this group; any remainder opens a new one.
        if (Math.abs(runningPosition) < 1e-9) {
          groups.push(finalizeGroup(builder, t, false));
          builder = null;
        }
      }
    }

    // A group still open at the end of the stream (never returned to flat).
    if (builder !== null) {
      groups.push(finalizeGroup(builder, null, true));
      builder = null;
    }
  }

  // Order groups chronologically by their opening execution.
  groups.sort((a, b) => {
    const dateCmp = a.openedDate.localeCompare(b.openedDate);
    if (dateCmp !== 0) return dateCmp;
    return timeToMinutes(a.openedTime) - timeToMinutes(b.openedTime);
  });

  return groups;
}

function finalizeGroup(
  b: GroupBuilder,
  closingTx: TransactionRecord | null,
  isOpen: boolean,
): TradeGroup {
  const nativeGrossPnL = b.realizedGross;
  const nativeNetPnL = nativeGrossPnL + b.realizedCommission;
  const grossPnL = b.realizedGrossAccount;
  const netPnL = grossPnL + b.realizedCommissionAccount;

  const openRemaining = b.openLots.reduce((s, l) => s + l.qty, 0);
  const openCost = b.openLots.reduce((s, l) => s + l.qty * l.entryPrice, 0);
  const netQuantity = isOpen ? (b.side === 'LONG' ? openRemaining : -openRemaining) : 0;

  // Representative FX for display — the last leg carrying a provider rate.
  const rep = [...b.legs]
    .reverse()
    .map((l) => l.transaction)
    .find((t) => t.fxRateToAccount != null);

  const volume = b.legs.reduce((s, l) => s + l.quantity, 0);

  return {
    key: `${b.accountId}${b.symbol}${b.openedDate}${b.openedTime}${b.seq}`,
    accountId: b.accountId,
    symbol: b.symbol,
    companyName: b.companyName,
    currency: b.currency,
    accountCurrency: rep?.fxAccountCurrency ?? b.currency,
    side: b.side,
    legs: b.legs,
    openedDate: b.openedDate,
    openedTime: b.openedTime,
    closedDate: isOpen ? undefined : closingTx?.date,
    closedTime: isOpen ? undefined : closingTx?.time,
    tradingDay: b.tradingDay,
    entryAvgPrice: b.openQtyTotal > 1e-9 ? b.openCostTotal / b.openQtyTotal : 0,
    exitAvgPrice: b.closeQtyTotal > 1e-9 ? b.closeCostTotal / b.closeQtyTotal : 0,
    maxPosition: b.maxPosition,
    volume,
    executions: b.legs.length,
    grossPnL,
    totalCommissions: b.realizedCommissionAccount,
    netPnL,
    nativeGrossPnL,
    nativeTotalCommissions: b.realizedCommission,
    nativeNetPnL,
    isOpen,
    netQuantity,
    openAvgCost: openRemaining > 1e-9 ? openCost / openRemaining : 0,
    fxRateToAccount: rep?.fxRateToAccount,
    fxRateDate: rep?.fxRateDate,
  };
}

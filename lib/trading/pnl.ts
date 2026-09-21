import type { TransactionRecord } from '../db/schema';

/**
 * Single source of truth for turning a broker fill into account-currency P&L.
 *
 * The canonical realized P&L is IBKR's own `fifoPnlRealized` (stored as
 * `realizedPnL`), which is already NET of commissions and already includes the
 * contract multiplier. Every engine (client `aggregateByDay`, server
 * `splitIntoTradeGroups`) must run these same primitives so a day/trade total is
 * identical no matter which one produced it.
 */

/** FX factor to convert a fill's native amounts into the account currency. */
export function fxRate(t: TransactionRecord): number {
  const source = t.currency?.toUpperCase();
  const target = t.fxAccountCurrency?.toUpperCase();
  if (!source || !target || source === target) return 1;
  return t.fxRateToAccount && t.fxRateToAccount > 0 ? t.fxRateToAccount : 1;
}

/**
 * Effective cash-per-(qty×price) factor. IBKR Flex often omits the contract
 * multiplier (futures point value, bond percent-of-par), so `price × qty` alone
 * mis-states P&L. Derive it from the fill's own cash value:
 * |totalValue| / (qty × price) — 1 for shares, the point value for futures
 * (¥100 N225, HK$50 HSI, $25 micro copper), 0.01 for bonds. Falls back to the
 * reported multiplier only when cash value is unavailable.
 */
export function contractFactor(t: TransactionRecord): number {
  const absQty = Math.abs(t.quantity);
  const absPrice = Math.abs(t.price);
  if (absQty > 0 && absPrice > 0 && t.totalValue) {
    return Math.abs(t.totalValue) / (absQty * absPrice);
  }
  return t.multiplier && t.multiplier > 0 ? t.multiplier : 1;
}

/** True when the broker reported its own realized P&L for this fill. */
export function hasReportedRealized(t: TransactionRecord): boolean {
  return t.realizedPnL != null;
}

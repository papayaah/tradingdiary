import type { CashFlowRecord, CashFlowType } from '../db/schema';

/**
 * Cash-flow-aware account equity and return. Trading P&L is kept distinct from
 * capital contributions (deposits/withdrawals) and non-trading income
 * (interest/dividends/fees), so a deposit never looks like a trading gain and
 * the return % has an honest capital base. See docs/specs P0 #6.
 */

/** The sign a positive magnitude of each type contributes to equity. */
const TYPE_SIGN: Record<CashFlowType, 1 | -1> = {
  deposit: 1,
  withdrawal: -1,
  interest: 1,
  dividend: 1,
  fee: -1,
  adjustment: 1, // adjustment stores its own sign directly
};

/** Apply the conventional sign for a type to a user-entered magnitude. */
export function signedAmount(type: CashFlowType, magnitude: number): number {
  if (type === 'adjustment') return magnitude; // caller provides the sign
  return Math.abs(magnitude) * TYPE_SIGN[type];
}

export interface CashFlowSummary {
  /** External capital in/out: deposits minus withdrawals. */
  contributions: number;
  /** Non-trading account income/cost: interest + dividends − fees + adjustments. */
  nonTradingIncome: number;
  /** contributions + nonTradingIncome (all non-trading balance changes). */
  net: number;
}

export function summarizeCashFlows(cashFlows: CashFlowRecord[]): CashFlowSummary {
  let contributions = 0;
  let nonTradingIncome = 0;
  for (const cf of cashFlows) {
    if (cf.type === 'deposit' || cf.type === 'withdrawal') {
      contributions += cf.amount;
    } else {
      nonTradingIncome += cf.amount;
    }
  }
  return { contributions, nonTradingIncome, net: contributions + nonTradingIncome };
}

export interface AccountEquity {
  /** Starting capital (account.initialBalance), 0 when unset. */
  initialBalance: number;
  contributions: number;
  nonTradingIncome: number;
  /** Realized trading P&L (net of commissions). */
  tradingPnL: number;
  /** initialBalance + contributions + nonTradingIncome + tradingPnL. */
  equity: number;
  /** Capital base the trading return is measured against. */
  capitalBase: number;
  /** tradingPnL / capitalBase, or null when there is no capital base to divide by. */
  tradingReturnPct: number | null;
}

/**
 * Combine account capital, cash flows, and trading P&L into equity + an honest
 * trading return. `initialBalance` undefined is treated as 0; when there is no
 * capital base (no initial balance and no net deposits), the return is null
 * rather than a misleading percentage.
 */
export function computeAccountEquity(
  initialBalance: number | undefined,
  cashFlows: CashFlowRecord[],
  tradingPnL: number,
): AccountEquity {
  const base = initialBalance ?? 0;
  const { contributions, nonTradingIncome } = summarizeCashFlows(cashFlows);
  const capitalBase = base + contributions;
  const equity = base + contributions + nonTradingIncome + tradingPnL;
  return {
    initialBalance: base,
    contributions,
    nonTradingIncome,
    tradingPnL,
    equity,
    capitalBase,
    tradingReturnPct: capitalBase > 0 ? (tradingPnL / capitalBase) * 100 : null,
  };
}

export interface EquityPoint {
  date: string; // YYYYMMDD
  equity: number;
}

/**
 * Equity over time: starting from initialBalance, apply each day's cash flows
 * and trading P&L in date order. `tradingPnLByDate` and cash flows are keyed by
 * YYYYMMDD. Produces one point per date that has any activity, ascending.
 */
export function computeEquityCurve(
  initialBalance: number | undefined,
  cashFlows: CashFlowRecord[],
  tradingPnLByDate: Map<string, number>,
): EquityPoint[] {
  const byDate = new Map<string, number>();
  for (const [date, pnl] of tradingPnLByDate) {
    byDate.set(date, (byDate.get(date) ?? 0) + pnl);
  }
  for (const cf of cashFlows) {
    byDate.set(cf.date, (byDate.get(cf.date) ?? 0) + cf.amount);
  }

  const dates = [...byDate.keys()].sort();
  let running = initialBalance ?? 0;
  const points: EquityPoint[] = [];
  for (const date of dates) {
    running += byDate.get(date) ?? 0;
    points.push({ date, equity: Math.round(running * 100) / 100 });
  }
  return points;
}

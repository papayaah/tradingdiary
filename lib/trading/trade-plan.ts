export type TradeSide = 'LONG' | 'SHORT';

/**
 * Per-share risk implied by an entry and an initial stop. Returns null when the
 * stop is on the wrong side of the entry (a stop above entry on a long, or below
 * on a short) — that isn't a valid risk basis, and we never invent one.
 */
export function riskPerShare(
  side: TradeSide,
  entry: number,
  stop: number,
): number | null {
  const risk = side === 'LONG' ? entry - stop : stop - entry;
  return risk > 0 ? risk : null;
}

/** Reward per share from entry to a price, signed by trade direction. */
export function rewardPerShare(side: TradeSide, entry: number, price: number): number {
  return side === 'LONG' ? price - entry : entry - price;
}

/**
 * Planned R — reward-to-risk of the plan (first target vs initial stop). Null if
 * inputs are missing or the stop is invalid.
 */
export function plannedRMultiple(
  side: TradeSide,
  plannedEntry: number | undefined,
  initialStop: number | undefined,
  target: number | undefined,
): number | null {
  if (plannedEntry == null || initialStop == null || target == null) return null;
  const risk = riskPerShare(side, plannedEntry, initialStop);
  if (risk == null) return null;
  return rewardPerShare(side, plannedEntry, target) / risk;
}

/**
 * Realized R — actual result measured in units of initial risk. Risk basis is
 * the *actual* entry vs the initial stop (the risk you actually took). Null if
 * the stop is missing/invalid or there's no exit yet.
 */
export function realizedRMultiple(
  side: TradeSide,
  actualEntry: number | undefined,
  actualExit: number | undefined,
  initialStop: number | undefined,
): number | null {
  if (actualEntry == null || actualExit == null || initialStop == null) return null;
  const risk = riskPerShare(side, actualEntry, initialStop);
  if (risk == null) return null;
  return rewardPerShare(side, actualEntry, actualExit) / risk;
}

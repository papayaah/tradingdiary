import { getInstrumentDetails } from './instruments';

/**
 * The exchange trading day a trade belongs to.
 *
 * Imported execution times are interpreted as exchange-local time (US stocks and
 * futures = America/New_York). The trading day is derived automatically from the
 * instrument's exchange session — there is no user-configured cutoff.
 *
 * - Equities (and everything non-futures): the ET calendar date of the
 *   execution. Pre-market and after-hours stay on that date.
 * - CME/Globex futures: the session opens 18:00 ET the evening before and runs
 *   to 17:00 ET the next day, so a fill at or after 18:00 ET belongs to the next
 *   day's session (e.g. Sunday 18:00 ET is Monday's trading day).
 *
 * See lib/scanner/sessions.ts for the full session model.
 */

const GLOBEX_ROLL = '18:00:00';

/** The next weekday (skips Sat/Sun) after a YYYYMMDD date. */
export function nextTradingDay(dateStr: string): string {
  const y = parseInt(dateStr.substring(0, 4));
  const m = parseInt(dateStr.substring(4, 6)) - 1;
  const d = parseInt(dateStr.substring(6, 8));
  const next = new Date(y, m, d);
  do {
    next.setDate(next.getDate() + 1);
  } while (next.getDay() === 0 || next.getDay() === 6);
  return `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}${String(next.getDate()).padStart(2, '0')}`;
}

/** The trading day (YYYYMMDD) for an execution, from its symbol's exchange. */
export function tradingDayFor(date: string, time: string, symbol: string): string {
  const { assetClass } = getInstrumentDetails(symbol);
  if (assetClass === 'future') {
    return time >= GLOBEX_ROLL ? nextTradingDay(date) : date;
  }
  return date;
}

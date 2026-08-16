/**
 * Trade times are shown in the instrument's EXCHANGE timezone, not the viewer's
 * local time — a trade reads as "3:00 PM ET" (aligned to the market session)
 * regardless of where the trader is sitting. Stored times are already
 * exchange-local (US equities & futures = America/New_York, per
 * lib/trading/trading-day.ts), so this formats the wall-clock digits and appends
 * the correct EST/EDT label for the date.
 *
 * (US stocks and futures both settle on ET-based sessions, so the label is
 * date-driven only. When a non-ET exchange is supported, thread the symbol
 * through here to pick its timezone.)
 */

/** EST vs EDT for a YYYYMMDD date (daylight saving handled by the tz database). */
export function exchangeTimeLabel(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(4, 6)) - 1;
  const d = Number(date.slice(6, 8));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return 'ET';
  // Noon UTC on the date is unambiguously the same calendar day in ET.
  const at = new Date(Date.UTC(y, m, d, 17, 0, 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  }).formatToParts(at);
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? 'ET';
}

/** Format a stored (exchange-local) HH:MM[:SS] as 12-hour time with a tz label,
 * e.g. "1:06 PM EDT". */
export function formatExchangeTime(time: string, date: string): string {
  const [h, m = '00'] = (time || '').split(':');
  const hour = Number(h);
  if (!Number.isFinite(hour)) return time;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${m.padStart(2, '0')} ${suffix} ${exchangeTimeLabel(date)}`;
}

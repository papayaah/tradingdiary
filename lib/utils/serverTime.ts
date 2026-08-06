/**
 * Parse a server timestamp to epoch milliseconds, treating tz-less values as UTC.
 *
 * The scanner's Postgres columns are `timestamp` WITHOUT time zone (Drizzle
 * `mode: 'string'`), so the API returns UTC-naive strings like
 * "2026-08-06 08:01:36.568" — no `T`, no `Z`. `Date.parse` reads such strings in
 * the browser's LOCAL zone, which shifts them by the viewer's UTC offset and
 * (e.g. at UTC+8) makes every schedule look perpetually "Due now". Normalize to
 * an explicit UTC ISO string before parsing.
 */
export function parseServerTimestampMs(value: string | null | undefined): number {
  if (!value) return NaN;
  // Already carries a zone (Z or ±HH:MM) → trust it.
  if (/[zZ]$|[+-]\d\d:?\d\d$/.test(value)) return Date.parse(value);
  const iso = (value.includes('T') ? value : value.replace(' ', 'T')) + 'Z';
  return Date.parse(iso);
}

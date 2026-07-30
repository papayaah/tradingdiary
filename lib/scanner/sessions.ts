// Eastern-Time session eligibility. Uses Intl with the America/New_York time
// zone, so daylight-saving transitions are handled by the platform tz database.
//
// This is the initial equity-session model; futures/crypto are treated as
// always-eligible for now (their own calendars are a later refinement, per the
// spec's "Treat futures and crypto with their own session rules").

export type WatchSession = 'rth' | 'pre' | 'ext' | 'all';
export type AssetClass = 'equity' | 'futures' | 'crypto';

interface EtParts {
  weekday: number; // 0=Sun ... 6=Sat
  minutes: number; // minutes since ET midnight
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function etParts(at: Date): EtParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = WEEKDAYS[get('weekday')] ?? 0;
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0; // some environments emit "24" at midnight
  const minute = Number(get('minute'));
  return { weekday, minutes: hour * 60 + minute };
}

const RTH_OPEN = 9 * 60 + 30; // 09:30
const RTH_CLOSE = 16 * 60; // 16:00
const PRE_OPEN = 4 * 60; // 04:00
const EXT_CLOSE = 20 * 60; // 20:00

/** Whether a watch is eligible to scan right now for its session/asset class. */
export function isSessionActive(
  session: WatchSession,
  assetClass: AssetClass,
  at: Date = new Date(),
): boolean {
  if (session === 'all') return true;
  if (assetClass !== 'equity') return true; // futures/crypto: always-eligible for now

  const { weekday, minutes } = etParts(at);
  const isWeekday = weekday >= 1 && weekday <= 5;
  if (!isWeekday) return false;

  switch (session) {
    case 'rth':
      return minutes >= RTH_OPEN && minutes < RTH_CLOSE;
    case 'pre':
      // The UI's `pre` option means "Pre-market + Regular", not pre-market
      // only. Keep the server scheduler aligned with its 04:00–16:00 ET label.
      return minutes >= PRE_OPEN && minutes < RTH_CLOSE;
    case 'ext':
      return minutes >= PRE_OPEN && minutes < EXT_CLOSE;
    default:
      return false;
  }
}

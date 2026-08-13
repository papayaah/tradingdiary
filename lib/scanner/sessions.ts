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
  if (assetClass === 'crypto') return true; // Crypto trades 24/7/365

  const { weekday, minutes } = etParts(at);

  if (assetClass === 'futures') {
    // CME / Globex Futures schedule (in America/New_York ET):
    // Opens Sunday 6:00 PM ET (18:00), closes Friday 5:00 PM ET (17:00).
    // Closed all day Saturday. Closed Sunday 00:00 - 18:00 ET.
    // Mon-Thu daily maintenance pause: 17:00 ET to 18:00 ET.
    if (weekday === 6) return false; // Saturday: closed all day
    if (weekday === 0 && minutes < 18 * 60) return false; // Sunday before 6:00 PM ET: closed
    if (weekday === 5 && minutes >= 17 * 60) return false; // Friday after 5:00 PM ET: closed
    if (weekday >= 1 && weekday <= 4 && minutes >= 17 * 60 && minutes < 18 * 60) return false; // Mon-Thu 5p-6p ET halt
    return true;
  }

  const isWeekday = weekday >= 1 && weekday <= 5;
  if (!isWeekday) return false;

  switch (session) {
    case 'all':
      // Equities do not trade 24/7. "All" means the full available intraday
      // session; continuous asset classes returned above remain always active.
      return minutes >= PRE_OPEN && minutes < EXT_CLOSE;
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

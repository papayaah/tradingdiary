const FLEX_TIME_ZONE = 'Asia/Manila';
const FLEX_HOUR = 14;
const FLEX_MINUTE = 10;

function zonedParts(date: Date): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: FLEX_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  );
}

function offsetAt(date: Date): number {
  const parts = zonedParts(date);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return representedAsUtc - date.getTime();
}

function localSyncTimeToUtc(year: number, month: number, day: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, FLEX_HOUR, FLEX_MINUTE));
  const firstPass = new Date(guess.getTime() - offsetAt(guess));
  return new Date(guess.getTime() - offsetAt(firstPass));
}

/** Next daily Activity Flex sync at 14:10 Asia/Manila (06:10 UTC year-round). */
export function nextDailyFlexSync(now = new Date()): Date {
  const parts = zonedParts(now);
  const localToday = Date.UTC(parts.year, parts.month - 1, parts.day);
  const targetDay = parts.hour * 60 + parts.minute >= FLEX_HOUR * 60 + FLEX_MINUTE
    ? new Date(localToday + 24 * 60 * 60 * 1000)
    : new Date(localToday);
  return localSyncTimeToUtc(
    targetDay.getUTCFullYear(),
    targetDay.getUTCMonth() + 1,
    targetDay.getUTCDate(),
  );
}

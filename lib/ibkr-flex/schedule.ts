const EASTERN_TIME_ZONE = 'America/New_York';

function zonedParts(date: Date): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
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

function easternLocalToUtc(year: number, month: number, day: number, hour: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour));
  const firstPass = new Date(guess.getTime() - offsetAt(guess));
  return new Date(guess.getTime() - offsetAt(firstPass));
}

/** Next daily Activity Flex sync, defaulting to 06:00 America/New_York. */
export function nextDailyFlexSync(now = new Date(), hourEastern = 6): Date {
  const parts = zonedParts(now);
  const localToday = Date.UTC(parts.year, parts.month - 1, parts.day);
  const targetDay = parts.hour >= hourEastern
    ? new Date(localToday + 24 * 60 * 60 * 1000)
    : new Date(localToday);
  return easternLocalToUtc(
    targetDay.getUTCFullYear(),
    targetDay.getUTCMonth() + 1,
    targetDay.getUTCDate(),
    hourEastern,
  );
}

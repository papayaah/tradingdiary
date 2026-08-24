/** UTC offset, in seconds, for New York on the supplied YYYYMMDD date. */
export function getETOffsetSeconds(dateStr: string): number {
  if (!dateStr || dateStr.length !== 8) return 0;
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  const refUTC = new Date(Date.UTC(year, month, day, 12, 0, 0));
  const etParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    hour: 'numeric',
  }).formatToParts(refUTC);
  const etHourAtNoonUTC = parseInt(etParts.find((part) => part.type === 'hour')?.value ?? '7');
  return (etHourAtNoonUTC - 12) * 3600;
}

/** Convert an exchange-local ET wall-clock time to its real UTC epoch. */
export function etWallClockToEpochSeconds(dateStr: string, timeStr: string): number | null {
  if (!/^\d{8}$/.test(dateStr)) return null;
  const parts = timeStr.split(':').map(Number);
  if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) return null;
  const [hour, minute, second = 0] = parts;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;

  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  return Math.floor(Date.UTC(year, month, day, hour, minute, second) / 1000)
    - getETOffsetSeconds(dateStr);
}

/**
 * Return the candle bucket containing an execution. Candle timestamps are bar
 * start times, so this floors to the preceding candle rather than selecting the
 * nearest bar and moving second-half fills onto the following candle.
 */
export function findExecutionCandleTime(
  candles: readonly { time: number }[],
  executionTime: string,
  dateStr?: string,
): number | null {
  if (candles.length === 0) return null;

  const wallClockParts = executionTime.split(':').map(Number);
  if (wallClockParts.length < 2 || wallClockParts.some((part) => !Number.isFinite(part))) return null;
  const target = dateStr
    ? etWallClockToEpochSeconds(dateStr, executionTime)
    : wallClockParts[0] * 3600 + wallClockParts[1] * 60 + (wallClockParts[2] || 0);
  if (target === null) return null;

  if (target <= candles[0].time) return candles[0].time;
  const last = candles[candles.length - 1];
  if (target >= last.time) return last.time;

  let low = 0;
  let high = candles.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candleTime = candles[middle].time;
    if (candleTime === target) return candleTime;
    if (candleTime < target) low = middle + 1;
    else high = middle - 1;
  }

  return candles[Math.max(0, high)].time;
}

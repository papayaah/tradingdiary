export interface PriceCandle {
  time: number;
  close: number;
}

export interface IntradayChange {
  amount: number;
  percent: number;
}

const easternPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function getEasternDateAndMinute(timestampSeconds: number) {
  const parts = easternPartsFormatter.formatToParts(new Date(timestampSeconds * 1000));
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minute: Number(values.hour) * 60 + Number(values.minute),
  };
}

/**
 * Calculate an equity's current-session move from the prior regular-session
 * close using candles already returned by the market-data provider.
 */
export function calculateEquityIntradayChange(
  candles: PriceCandle[],
): IntradayChange | null {
  const latest = candles[candles.length - 1];
  if (!latest || !Number.isFinite(latest.close)) return null;

  const latestEasternDate = getEasternDateAndMinute(latest.time).date;
  let previousClose: PriceCandle | null = null;

  for (const candle of candles) {
    if (!Number.isFinite(candle.time) || !Number.isFinite(candle.close)) continue;

    const eastern = getEasternDateAndMinute(candle.time);
    if (
      eastern.date !== latestEasternDate
      && eastern.minute >= 9 * 60 + 30
      && eastern.minute < 16 * 60
      && (!previousClose || candle.time > previousClose.time)
    ) {
      previousClose = candle;
    }
  }

  if (!previousClose || previousClose.close === 0) return null;

  const amount = latest.close - previousClose.close;
  return {
    amount,
    percent: (amount / previousClose.close) * 100,
  };
}

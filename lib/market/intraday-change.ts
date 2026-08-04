export interface PriceCandle {
  time: number;
  close: number;
}

export interface PriceWindowCandle extends PriceCandle {
  open: number;
}

export interface IntradayChange {
  amount: number;
  percent: number;
}

export function candleCountForHours(interval: string, hours = 4): number {
  const clean = interval.replace(/[ms]/g, '');
  const value = parseInt(clean, 10) || 5;
  const minutesPerCandle = interval.endsWith('h') ? value * 60 : value;
  return Math.max(4, Math.ceil((hours * 60) / Math.max(1, minutesPerCandle)));
}

/** Price move across a supplied candle window, matching the alert-card fallback. */
export function calculateCandleWindowChange(
  candles: PriceWindowCandle[],
): IntradayChange | null {
  const firstOpen = candles[0]?.open;
  const lastClose = candles.at(-1)?.close;
  if (!Number.isFinite(firstOpen) || !Number.isFinite(lastClose) || firstOpen === 0) {
    return null;
  }

  const amount = lastClose! - firstOpen!;
  return { amount, percent: (amount / firstOpen!) * 100 };
}

/** Resolve the change displayed on watch cards/rows for any supported market. */
export function calculateWatchPriceChange(
  symbol: string,
  interval: string,
  candles: PriceWindowCandle[],
): IntradayChange | null {
  if (candles.length < 2) return null;
  const windowCandles = candles.slice(-candleCountForHours(interval));
  const isContinuousMarket = symbol.includes('=F') || symbol.includes('-USD');
  return isContinuousMarket
    ? calculateCandleWindowChange(windowCandles)
    : calculateEquityIntradayChange(candles) ?? calculateCandleWindowChange(windowCandles);
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

/**
 * Calculate a futures contract's session change from the prior settlement — the
 * baseline IBKR (and exchanges) display as "Change". Futures trade nearly around
 * the clock, so there is no regular-session prior close; the correct baseline is
 * the previous trading day's settlement, which equals the close of the prior
 * DAILY bar. `dailyCandles` must be ascending daily bars; the last is the
 * current (in-progress) session and the one before it is the prior settlement.
 */
export function calculateFuturesDailyChange(
  dailyCandles: PriceCandle[],
  lastPrice: number,
): IntradayChange | null {
  if (!Number.isFinite(lastPrice) || dailyCandles.length < 2) return null;
  const priorClose = dailyCandles[dailyCandles.length - 2]?.close;
  if (!Number.isFinite(priorClose) || priorClose === 0) return null;
  const amount = lastPrice - priorClose;
  return {
    amount,
    percent: (amount / priorClose) * 100,
  };
}

import { formatCurrency } from '@/lib/currency';

const CLOCK_TIME_PATTERN = /\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b(?!\s*[AP]\.?M\.?\b)/gi;
const DECIMAL_WITH_ET_PATTERN = /((?:HK|NT|[SAC])\$|[$€£¥₩₱]|[A-Z]{3}\s+)?(\d{1,9}(?:,\d{3})*\.\d{1,6})\s+ET\b/g;

function to12HourTime(hour24: number, minute: string, second?: string): string {
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute}${second ? `:${second}` : ''} ${period}`;
}

/**
 * Format an ET wall-clock timestamp without applying the browser/server's local
 * timezone. Trade-analysis timestamps intentionally store ET wall-clock parts
 * in UTC fields so deterministic execution and candle windows line up.
 */
export function formatEtTimestamp12Hour(ms?: number): string | undefined {
  if (ms == null) return undefined;
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${to12HourTime(date.getUTCHours(), minute, second)} ET`;
}

/** Normalize clock times in AI prose, including ranges where only the final
 * time carries the ET suffix. Already-normalized AM/PM times are left alone. */
export function normalizeReviewTimestamps(text: string): string {
  return text.replace(
    CLOCK_TIME_PATTERN,
    (_match, hour: string, minute: string, second?: string) =>
      to12HourTime(Number(hour), minute, second),
  );
}

/**
 * Repair the model's occasional mistake of attaching the Eastern Time suffix
 * to a decimal price (for example, "54.16 ET"). A decimal is not a valid clock
 * time; bare values are formatted using the trade's currency.
 */
export function normalizeReviewPrices(text: string, currency = 'USD'): string {
  return text.replace(
    DECIMAL_WITH_ET_PATTERN,
    (_match, existingCurrency: string | undefined, rawValue: string) => {
      if (existingCurrency) return `${existingCurrency}${rawValue}`;
      return formatCurrency(Number(rawValue.replace(/,/g, '')), currency);
    },
  );
}

export function normalizeReviewTextValues(text: string, currency = 'USD'): string {
  return normalizeReviewTimestamps(normalizeReviewPrices(text, currency));
}

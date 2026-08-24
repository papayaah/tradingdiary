import { formatCurrency } from '@/lib/currency';

const CLOCK_TIME_PATTERN = /\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b(?!:[0-5]\d)(?!\s*[AP]\.?M\.?\b)/gi;
const TWELVE_HOUR_WITH_SECONDS_PATTERN = /\b(1[0-2]|0?[1-9]):([0-5]\d):[0-5]\d\s+([AP])\.?M\.?\b/gi;
const MALFORMED_TWELVE_HOUR_PATTERN = /\b(1[0-2]|0?[1-9]):([0-5]\d)\s+[AP]\.?M\.?:[0-5]\d\s+([AP])\.?M\.?(\s+ET)?\b/gi;
const ISO_DATE_PATTERN = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const DECIMAL_WITH_ET_PATTERN = /((?:HK|NT|[SAC])\$|[$€£¥₩₱]|[A-Z]{3}\s+)?(\d{1,9}(?:,\d{3})*\.\d{1,6})\s+ET\b/g;
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

function to12HourTime(hour24: number, minute: string): string {
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${period}`;
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
  const month = MONTH_NAMES[date.getUTCMonth()];
  const day = date.getUTCDate();
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  return `${month} ${day}, ${year} at ${to12HourTime(date.getUTCHours(), minute)} ET`;
}

/** Normalize clock times in AI prose, including ranges where only the final
 * time carries the ET suffix. Seconds are omitted from review prose. */
export function normalizeReviewTimestamps(text: string): string {
  return text
    // Repair output produced by the previous normalizer, which could turn
    // "11:35:42 PM" into "11:35 AM:42 PM". The trailing period is the
    // original, authoritative one.
    .replace(
      MALFORMED_TWELVE_HOUR_PATTERN,
      (_match, hour: string, minute: string, period: string, et?: string) =>
        `${Number(hour)}:${minute} ${period.toUpperCase()}M${et ?? ''}`,
    )
    .replace(
      TWELVE_HOUR_WITH_SECONDS_PATTERN,
      (_match, hour: string, minute: string, period: string) =>
        `${Number(hour)}:${minute} ${period.toUpperCase()}M`,
    )
    .replace(
      CLOCK_TIME_PATTERN,
      (_match, hour: string, minute: string) =>
        to12HourTime(Number(hour), minute),
    );
}

/** Convert machine-style dates in model prose to a compact readable date. */
export function normalizeReviewDates(text: string): string {
  return text.replace(
    ISO_DATE_PATTERN,
    (match, year: string, rawMonth: string, rawDay: string) => {
      const month = Number(rawMonth);
      const day = Number(rawDay);
      if (month < 1 || month > 12 || day < 1 || day > 31) return match;
      return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
    },
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
  return normalizeReviewDates(normalizeReviewTimestamps(normalizeReviewPrices(text, currency)));
}

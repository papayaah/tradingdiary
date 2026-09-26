export type LiveQuoteMap = Record<string, number>;

const inFlightRequests = new Map<string, Promise<LiveQuoteMap>>();
const resolvedRequests = new Map<string, { prices: LiveQuoteMap; expiresAt: number }>();

const LIVE_QUOTE_TTL_MS = 5 * 60_000;
const LIVE_QUOTE_TIMEOUT_MS = 12_000;

/**
 * Fetch a live quote set once, even when multiple mounted effects request the
 * same symbols concurrently (for example React Strict Mode's development
 * setup/cleanup/setup check).
 */
export function getLiveQuotes(symbols: string[]): Promise<LiveQuoteMap> {
  const normalized = [...new Set(
    symbols.map((symbol) => symbol.trim()).filter(Boolean),
  )].sort();
  if (normalized.length === 0) return Promise.resolve({});

  const key = normalized.join(',');
  const cached = resolvedRequests.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.prices);
  }
  const existing = inFlightRequests.get(key);
  if (existing) return existing;

  const params = new URLSearchParams({ symbols: key });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_QUOTE_TIMEOUT_MS);
  const request = fetch(`/api/quotes?${params}`, {
    cache: 'default',
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`quote request failed: ${response.status}`);
      const prices = await response.json() as LiveQuoteMap;
      resolvedRequests.set(key, {
        prices,
        expiresAt: Date.now() + LIVE_QUOTE_TTL_MS,
      });
      return prices;
    })
    .catch((error) => {
      // A recently expired quote is preferable to leaving the dashboard in a
      // loading state when the provider is temporarily slow or unavailable.
      if (cached) return cached.prices;
      throw error;
    })
    .finally(() => {
      clearTimeout(timeout);
      if (inFlightRequests.get(key) === request) inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, request);
  return request;
}

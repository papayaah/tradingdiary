export type LiveQuoteMap = Record<string, number>;

const inFlightRequests = new Map<string, Promise<LiveQuoteMap>>();

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
  const existing = inFlightRequests.get(key);
  if (existing) return existing;

  const params = new URLSearchParams({ symbols: key });
  const request = fetch(`/api/quotes?${params}`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`quote request failed: ${response.status}`);
      return response.json() as Promise<LiveQuoteMap>;
    })
    .finally(() => {
      if (inFlightRequests.get(key) === request) inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, request);
  return request;
}

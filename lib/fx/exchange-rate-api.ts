const API_ORIGIN = 'https://v6.exchangerate-api.com/v6';

type SuccessResponse = {
  result: 'success';
  base_code: string;
  conversion_rates: Record<string, number>;
  year?: number;
  month?: number;
  day?: number;
  time_last_update_unix?: number;
};

type ErrorResponse = {
  result: 'error';
  'error-type'?: string;
};

export type ExchangeRate = {
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  rateDate: string;
  provider: 'exchange-rate-api';
};

export type ExchangeRateTable = {
  baseCurrency: string;
  rates: Record<string, number>;
  rateDate: string;
  provider: 'exchange-rate-api';
};

export type ExchangeRateRequest = {
  baseCurrency: string;
  quoteCurrency: string;
  /** UTC calendar date in YYYY-MM-DD form. Omit for the latest published rate. */
  date?: string;
};

type RequestOptions = {
  apiKey?: string;
  fetcher?: typeof fetch;
};

const historicalCache = new Map<string, Promise<ExchangeRateTable>>();

function currencyCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new Error(`Invalid ISO 4217 currency code: ${value}`);
  }
  return code;
}

function calendarDate(value: string): { iso: string; path: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid FX rate date: ${value}`);

  const [, year, month, day] = match;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    throw new Error(`Invalid FX rate date: ${value}`);
  }

  return { iso: value, path: `${Number(year)}/${Number(month)}/${Number(day)}` };
}

export async function getExchangeRate(
  request: ExchangeRateRequest,
  options: RequestOptions = {},
): Promise<ExchangeRate> {
  const baseCurrency = currencyCode(request.baseCurrency);
  const quoteCurrency = currencyCode(request.quoteCurrency);
  const requestedDate = request.date ? calendarDate(request.date) : undefined;

  if (baseCurrency === quoteCurrency) {
    return {
      baseCurrency,
      quoteCurrency,
      rate: 1,
      rateDate: requestedDate?.iso ?? new Date().toISOString().slice(0, 10),
      provider: 'exchange-rate-api',
    };
  }

  const table = await getExchangeRateTable(baseCurrency, request.date, options);
  const rate = table.rates[quoteCurrency];
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`ExchangeRate-API returned no valid ${baseCurrency}/${quoteCurrency} rate`);
  }

  return {
    baseCurrency,
    quoteCurrency,
    rate,
    rateDate: table.rateDate,
    provider: 'exchange-rate-api',
  };
}

export async function getExchangeRateTable(
  base: string,
  date?: string,
  options: RequestOptions = {},
): Promise<ExchangeRateTable> {
  const baseCurrency = currencyCode(base);
  const requestedDate = date ? calendarDate(date) : undefined;
  const cacheKey = requestedDate ? `${baseCurrency}:${requestedDate.iso}` : undefined;

  if (cacheKey && !options.apiKey && !options.fetcher) {
    const cached = historicalCache.get(cacheKey);
    if (cached) return cached;
    const pending = fetchExchangeRateTable(baseCurrency, requestedDate, options);
    historicalCache.set(cacheKey, pending);
    pending.catch(() => historicalCache.delete(cacheKey));
    return pending;
  }

  return fetchExchangeRateTable(baseCurrency, requestedDate, options);
}

async function fetchExchangeRateTable(
  baseCurrency: string,
  requestedDate: { iso: string; path: string } | undefined,
  options: RequestOptions,
): Promise<ExchangeRateTable> {
  const apiKey = options.apiKey ?? process.env.EXCHANGE_RATE_API_KEY;
  if (!apiKey) {
    throw new Error('EXCHANGE_RATE_API_KEY is not configured');
  }

  const endpoint = requestedDate
    ? `${API_ORIGIN}/history/${baseCurrency}/${requestedDate.path}`
    : `${API_ORIGIN}/latest/${baseCurrency}`;
  const response = await (options.fetcher ?? fetch)(endpoint, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`ExchangeRate-API request failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as SuccessResponse | ErrorResponse;
  if (payload.result !== 'success') {
    throw new Error(`ExchangeRate-API request failed: ${payload['error-type'] ?? 'unknown error'}`);
  }

  const responseDate =
    payload.year && payload.month && payload.day
      ? `${payload.year.toString().padStart(4, '0')}-${payload.month.toString().padStart(2, '0')}-${payload.day.toString().padStart(2, '0')}`
      : payload.time_last_update_unix
        ? new Date(payload.time_last_update_unix * 1000).toISOString().slice(0, 10)
        : requestedDate?.iso ?? new Date().toISOString().slice(0, 10);

  return {
    baseCurrency,
    rates: payload.conversion_rates,
    rateDate: responseDate,
    provider: 'exchange-rate-api',
  };
}

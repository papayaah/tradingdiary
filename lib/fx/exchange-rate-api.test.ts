import { describe, expect, it, vi } from 'vitest';
import { getExchangeRate } from './exchange-rate-api';

describe('ExchangeRate-API client', () => {
  it('fetches a historical rate using bearer authentication', async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          result: 'success',
          year: 2026,
          month: 6,
          day: 25,
          base_code: 'KRW',
          conversion_rates: { USD: 0.00073 },
        }),
        { status: 200 },
      ),
    );

    await expect(
      getExchangeRate(
        { baseCurrency: 'krw', quoteCurrency: 'usd', date: '2026-06-25' },
        { apiKey: 'private-key', fetcher },
      ),
    ).resolves.toEqual({
      baseCurrency: 'KRW',
      quoteCurrency: 'USD',
      rate: 0.00073,
      rateDate: '2026-06-25',
      provider: 'exchange-rate-api',
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://v6.exchangerate-api.com/v6/history/KRW/2026/6/25',
      { headers: { Authorization: 'Bearer private-key' } },
    );
  });

  it('does not call the provider for identical currencies', async () => {
    const fetcher = vi.fn();
    const result = await getExchangeRate(
      { baseCurrency: 'JPY', quoteCurrency: 'JPY', date: '2026-06-25' },
      { fetcher },
    );

    expect(result.rate).toBe(1);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects invalid calendar dates before making a request', async () => {
    await expect(
      getExchangeRate(
        { baseCurrency: 'HKD', quoteCurrency: 'USD', date: '2026-02-30' },
        { apiKey: 'private-key' },
      ),
    ).rejects.toThrow('Invalid FX rate date');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLiveQuotes } from './live-quotes-client';

describe('getLiveQuotes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shares an identical in-flight request and normalizes symbol order', async () => {
    let resolveResponse!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn(() => pending);
    vi.stubGlobal('fetch', fetchMock);

    const first = getLiveQuotes(['USD.JPY', 'BILI', 'BILI']);
    const second = getLiveQuotes(['BILI', 'USD.JPY']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/quotes?symbols=BILI%2CUSD.JPY');

    resolveResponse(new Response(JSON.stringify({ BILI: 20, 'USD.JPY': 150 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(first).resolves.toEqual({ BILI: 20, 'USD.JPY': 150 });
    await expect(second).resolves.toEqual({ BILI: 20, 'USD.JPY': 150 });
  });
});

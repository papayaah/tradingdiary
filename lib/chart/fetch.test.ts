import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCandles } from './fetch';

vi.mock('./cache', () => ({ getCachedCandles: vi.fn(async () => null), setCachedCandles: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

describe('chart errors', () => {
  it('shows the actual IBKR error returned by the server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'IBKR error 200: No security definition found' }), { status: 500 })));
    await expect(fetchCandles('FDXM 20261218 M', '20261009'))
      .rejects.toThrow('IBKR error 200: No security definition found');
  });

  it('handles errors without a JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad Gateway', { status: 502 })));
    await expect(fetchCandles('FDXM 20261218 M', '20261009')).rejects.toThrow('Chart data fetch failed: 502');
  });
});

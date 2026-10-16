import { describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ contracts: [] as unknown[][], history: [] as unknown[][] }));

vi.mock('@stoqey/ib', async (importOriginal) => {
  const { EventEmitter } = await import('node:events');
  const actual = await importOriginal<typeof import('@stoqey/ib')>();
  class IBApi extends EventEmitter {
    connect() { queueMicrotask(() => this.emit(actual.EventName.nextValidId, 1)); }
    disconnect() {}
    reqContractDetails(id: number, contract: Record<string, unknown>) {
      calls.contracts.push([id, contract]);
      queueMicrotask(() => {
        this.emit(actual.EventName.contractDetails, id, { contract: { ...contract, conId: 673277359 } });
        this.emit(actual.EventName.contractDetailsEnd, id);
      });
    }
    reqHistoricalData(...args: unknown[]) {
      calls.history.push(args);
      queueMicrotask(() => {
        const end = Date.parse(String(args[2]).replace(/^(\d{4})(\d{2})(\d{2})-/, '$1-$2-$3T') + 'Z') / 1000;
        const times = args[4] === '1 day'
          ? ['20261013', '20261014', '20261015']
          : [end - 30 * 3600, end - 12 * 3600, end - 300, end].map(String);
        for (const time of times) {
          this.emit(actual.EventName.historicalData, args[0], time, 24000, 24010, 23990, 24005, 8);
        }
        this.emit(actual.EventName.historicalData, args[0], 'finished', 0, 0, 0, 0, 0);
      });
    }
  }
  return { ...actual, IBApi };
});

describe('IBKR journal futures history', () => {
  it('requests the imported expiry and historical day instead of recent continuous bars', async () => {
    const { IBKRProvider } = await import('./providers');
    const candles = await new IBKRProvider().fetchCandles('FDXM 20261218 M', '20261009', '5m');

    expect(calls.contracts[0][1]).toMatchObject({
      symbol: 'DAX', secType: 'FUT', exchange: 'EUREX', currency: 'EUR',
      tradingClass: 'FDXM', lastTradeDateOrContractMonth: '20261218', includeExpired: true,
    });
    expect(calls.history[0].slice(2, 5)).toEqual(['20261010-04:00:00', '2 D', '5 mins']);
    expect(candles.map(bar => new Date(bar.time * 1000).toISOString())).toEqual([
      '2026-10-09T16:00:00.000Z', '2026-10-10T03:55:00.000Z',
    ]);
    expect(candles[0].close).toBe(24005);
  });

  it('fetches Micro Silver using SI with the SIL trading class and the imported expiry', async () => {
    const { IBKRProvider } = await import('./providers');
    const candles = await new IBKRProvider().fetchCandles('SILZ6', '20261014', '5m');

    expect(calls.contracts.at(-1)?.[1]).toMatchObject({
      symbol: 'SI', secType: 'FUT', exchange: 'COMEX', currency: 'USD',
      tradingClass: 'SIL', lastTradeDateOrContractMonth: '202612', includeExpired: true,
    });
    expect(calls.history.at(-1)?.slice(2, 5)).toEqual(['20261015-04:00:00', '2 D', '5 mins']);
    expect(candles.map(bar => new Date(bar.time * 1000).toISOString())).toEqual([
      '2026-10-14T16:00:00.000Z', '2026-10-15T03:55:00.000Z',
    ]);
  });

  it('keeps daily bars on their supplied session date rather than shifting them to the prior NY day', async () => {
    const { IBKRProvider } = await import('./providers');
    const candles = await new IBKRProvider().fetchCandles('SILZ6', '20261014', '1d');
    expect(candles.map(bar => new Date(bar.time * 1000).toISOString())).toEqual([
      '2026-10-14T00:00:00.000Z',
    ]);
  });
});

vi.mock('@/lib/market-data/provider-request-gate', () => ({
  reserveProviderRequest: vi.fn(async () => {}),
}));

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
        this.emit(actual.EventName.historicalData, args[0], '1791540000', 24000, 24010, 23990, 24005, 8);
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
    expect(calls.history[0].slice(2, 5)).toEqual(['20261010-04:00:00', '1 D', '5 mins']);
    expect(candles).toHaveLength(1);
    expect(candles[0].close).toBe(24005);
  });
});

vi.mock('@/lib/market-data/provider-request-gate', () => ({
  reserveProviderRequest: vi.fn(async () => {}),
}));

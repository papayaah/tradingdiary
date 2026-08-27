import { describe, it, expect, vi } from 'vitest';

const providerSpies = vi.hoisted(() => ({
  fetchCandles: vi.fn(async () => []),
  fetchRecentCandles: vi.fn(async () => []),
}));

vi.mock('@/lib/chart/providers', () => ({
  getActiveProvider: () => ({
    name: 'Tiingo',
    fetchCandles: providerSpies.fetchCandles,
    fetchRecentCandles: providerSpies.fetchRecentCandles,
  }),
  effectiveProviderName: (p: { name: string }) => p.name,
}));
import {
  boundRecent,
  fetchCandles,
  filterCandlesForSession,
  isRecentCandleSnapshot,
  newYorkTradingDate,
  sanitizeCandles,
} from './candles';
import type { Candle } from './patterns';

const c = (time: number, close = 100): Partial<Candle> => ({
  time, open: close, high: close, low: close, close, volume: 10,
});

describe('sanitizeCandles', () => {
  it('drops candles with any non-finite OHLC value', () => {
    const raw = [
      c(3),
      { ...c(4), close: NaN },
      { ...c(5), high: Infinity },
      { ...c(6), open: undefined },
      c(7),
    ];
    const clean = sanitizeCandles(raw);
    expect(clean.map((x) => x.time)).toEqual([3, 7]);
  });

  it('sorts ascending by time and defaults missing volume to 0', () => {
    const clean = sanitizeCandles([c(9), c(2), { ...c(5), volume: undefined }]);
    expect(clean.map((x) => x.time)).toEqual([2, 5, 9]);
    expect(clean.find((x) => x.time === 5)?.volume).toBe(0);
  });
});

describe('boundRecent', () => {
  it('keeps at most the last 60 candles, preserving order', () => {
    const many = sanitizeCandles(Array.from({ length: 200 }, (_, i) => c(i + 1)));
    const bounded = boundRecent(many);
    expect(bounded).toHaveLength(60);
    expect(bounded[0].time).toBe(141); // 200 - 60 + 1
    expect(bounded[bounded.length - 1].time).toBe(200);
  });

  it('returns everything when fewer than 60', () => {
    const few = sanitizeCandles([c(1), c(2), c(3)]);
    expect(boundRecent(few)).toHaveLength(3);
  });
});

describe('intraday equity boundaries', () => {
  it('formats the trading date in New York rather than UTC', () => {
    expect(newYorkTradingDate(new Date('2026-08-01T02:00:00Z'))).toBe('20260731');
  });

  it('uses an exact NY date for equities and a rolling window for continuous assets', async () => {
    providerSpies.fetchCandles.mockClear();
    providerSpies.fetchRecentCandles.mockClear();

    await fetchCandles('AAPL', '10m', 'equity');
    expect(providerSpies.fetchCandles).toHaveBeenCalledWith(
      'AAPL',
      newYorkTradingDate(),
      '10m',
    );
    expect(providerSpies.fetchRecentCandles).not.toHaveBeenCalled();

    await fetchCandles('NQ=F', '10m', 'futures');
    expect(providerSpies.fetchRecentCandles).toHaveBeenCalledWith('NQ=F', '10m');

    providerSpies.fetchCandles.mockClear();
    providerSpies.fetchRecentCandles.mockClear();
    await fetchCandles('AAPL', '1d', 'equity');
    expect(providerSpies.fetchRecentCandles).toHaveBeenCalledWith('AAPL', '1d');
    expect(providerSpies.fetchCandles).not.toHaveBeenCalled();
  });

  it('filters equity candles to the selected ET session', () => {
    const at = (iso: string) => c(new Date(iso).getTime() / 1000) as Candle;
    const candles = sanitizeCandles([
      at('2026-07-30T12:00:00Z'), // 08:00 ET
      at('2026-07-30T13:30:00Z'), // 09:30 ET
      at('2026-07-30T19:59:00Z'), // 15:59 ET
      at('2026-07-30T20:00:00Z'), // 16:00 ET
      at('2026-07-30T23:59:00Z'), // 19:59 ET
      at('2026-07-31T00:00:00Z'), // 20:00 ET
    ]);

    expect(filterCandlesForSession(candles, 'rth', 'equity')).toHaveLength(2);
    expect(filterCandlesForSession(candles, 'pre', 'equity')).toHaveLength(3);
    expect(filterCandlesForSession(candles, 'ext', 'equity')).toHaveLength(5);
    expect(filterCandlesForSession(candles, 'all', 'equity')).toHaveLength(5);
    expect(filterCandlesForSession(candles, 'rth', 'futures')).toHaveLength(6);
  });
});

describe('isRecentCandleSnapshot', () => {
  const now = Date.parse('2026-08-27T10:30:00Z');

  it('accepts a recent persisted tail during a brief cache miss', () => {
    expect(isRecentCandleSnapshot([
      { time: Date.parse('2026-08-27T10:20:00Z') / 1000 },
    ], '10m', now)).toBe(true);
  });

  it('rejects a prior-day tail instead of presenting it as freshly scanned', () => {
    expect(isRecentCandleSnapshot([
      { time: Date.parse('2026-08-26T19:50:00Z') / 1000 },
    ], '10m', now)).toBe(false);
  });
});

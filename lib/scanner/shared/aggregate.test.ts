import { describe, it, expect } from 'vitest';
import { aggregateCandles, parseIntervalMinutes } from './aggregate';
import type { Candle } from '@/lib/scanner/patterns';

// A 10m boundary: 1_700_000_400 / 600 = 2_833_334 exactly.
const T0 = 1_700_000_400;

const oneMin = (
  index: number,
  over: Partial<Candle> = {},
): Candle => ({
  time: T0 + index * 60,
  open: 100 + index,
  high: 100 + index + 0.5,
  low: 100 + index - 0.5,
  close: 100 + index + 0.2,
  volume: 10 + index,
  ...over,
});

describe('parseIntervalMinutes', () => {
  it('parses minute and hour intervals; rejects seconds and junk', () => {
    expect(parseIntervalMinutes('1m')).toBe(1);
    expect(parseIntervalMinutes('10m')).toBe(10);
    expect(parseIntervalMinutes('2h')).toBe(120);
    expect(parseIntervalMinutes('30s')).toBeNull();
    expect(parseIntervalMinutes('foo')).toBeNull();
    expect(parseIntervalMinutes('0m')).toBeNull();
  });
});

describe('aggregateCandles — OHLCV and bucket alignment', () => {
  it('derives one 10m candle from ten aligned 1m bars', () => {
    const base = Array.from({ length: 10 }, (_, i) => oneMin(i));
    const { ok, candles } = aggregateCandles(base, '10m');

    expect(ok).toBe(true);
    expect(candles).toHaveLength(1);
    const c = candles[0];
    expect(c.time).toBe(T0); // stable bucket start
    expect(c.open).toBe(base[0].open); // first bar
    expect(c.close).toBe(base[9].close); // last bar
    expect(c.high).toBe(Math.max(...base.map((b) => b.high)));
    expect(c.low).toBe(Math.min(...base.map((b) => b.low)));
    expect(c.volume).toBe(base.reduce((s, b) => s + b.volume, 0));
  });

  it('keeps the latest partially formed bucket with its stable start time', () => {
    // 15 bars → one full 10m bucket (T0) + a 5-bar in-progress bucket (T0+600).
    const base = Array.from({ length: 15 }, (_, i) => oneMin(i));
    const { ok, candles } = aggregateCandles(base, '10m');

    expect(ok).toBe(true);
    expect(candles).toHaveLength(2);
    expect(candles[0].time).toBe(T0);
    expect(candles[1].time).toBe(T0 + 600);
    // The in-progress candle sums only the 5 bars seen so far.
    const tail = base.slice(10);
    expect(candles[1].close).toBe(tail[tail.length - 1].close);
    expect(candles[1].volume).toBe(tail.reduce((s, b) => s + b.volume, 0));
  });

  it('tolerates session gaps (missing minutes are not an error)', () => {
    const base = [oneMin(0), oneMin(1), oneMin(7)]; // minutes 2..6 missing
    const { ok, candles } = aggregateCandles(base, '10m');
    expect(ok).toBe(true);
    expect(candles).toHaveLength(1);
    expect(candles[0].volume).toBe(oneMin(0).volume + oneMin(1).volume + oneMin(7).volume);
  });

  it('passes 1m through unchanged and rejects sub-minute targets', () => {
    const base = [oneMin(0), oneMin(1)];
    expect(aggregateCandles(base, '1m')).toEqual({ ok: true, candles: base });
    expect(aggregateCandles(base, '30s').ok).toBe(false);
  });
});

describe('aggregateCandles — rejects inconsistent base bars', () => {
  it('fails on duplicated timestamps', () => {
    const base = [oneMin(0), oneMin(0)];
    const res = aggregateCandles(base, '10m');
    expect(res.ok).toBe(false);
    expect(res.candles).toEqual([]);
  });

  it('fails on out-of-order timestamps', () => {
    const base = [oneMin(2), oneMin(1)];
    expect(aggregateCandles(base, '10m').ok).toBe(false);
  });

  it('fails on empty base', () => {
    expect(aggregateCandles([], '10m').ok).toBe(false);
  });
});

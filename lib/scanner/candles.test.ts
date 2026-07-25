import { describe, it, expect } from 'vitest';
import { sanitizeCandles, boundRecent } from './candles';
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

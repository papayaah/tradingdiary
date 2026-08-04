import { describe, it, expect } from 'vitest';
import type { Candle } from '@/lib/scanner/patterns';
import { compareDerivedToNative } from './aggregation-parity';

const MIN = 60;

// Build a 1m base series starting at `startSec` for `count` bars.
function base(startSec: number, count: number, price = 100): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const p = price + i;
    out.push({ time: startSec + i * MIN, open: p, high: p + 0.5, low: p - 0.5, close: p + 0.2, volume: 10 });
  }
  return out;
}

// True native aggregation of a 1m series into `minutes` buckets (reference impl,
// independent of aggregate.ts so the test actually cross-checks).
function nativeAgg(oneMin: Candle[], minutes: number): Candle[] {
  const bucketSeconds = minutes * MIN;
  const groups = new Map<number, Candle[]>();
  for (const c of oneMin) {
    const b = Math.floor(c.time / bucketSeconds) * bucketSeconds;
    (groups.get(b) ?? groups.set(b, []).get(b)!).push(c);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, chunk]) => ({
      time,
      open: chunk[0].open,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, c) => s + c.volume, 0),
    }));
}

describe('compareDerivedToNative', () => {
  // Align to a 10m boundary in UTC so buckets are clean.
  const start = 1_700_000_400; // divisible by 600

  it('reports OK when derived matches native exactly', () => {
    const oneMin = base(start, 30);
    const native = nativeAgg(oneMin, 10);
    const report = compareDerivedToNative(oneMin, native, '10m');
    expect(report.ok).toBe(true);
    expect(report.mismatches).toHaveLength(0);
    expect(report.comparedBuckets).toBeGreaterThan(0);
  });

  it('flags an OHLC mismatch beyond tolerance', () => {
    const oneMin = base(start, 30);
    const native = nativeAgg(oneMin, 10);
    native[0] = { ...native[0], high: native[0].high * 1.5 }; // corrupt one bar
    const report = compareDerivedToNative(oneMin, native, '10m');
    expect(report.ok).toBe(false);
    expect(report.mismatches.some((m) => m.field === 'high')).toBe(true);
  });

  it('ignores the still-forming latest bucket', () => {
    // 25 one-minute bars => two full 10m buckets + a partial third.
    const oneMin = base(start, 25);
    const native = nativeAgg(oneMin, 10);
    // Corrupt ONLY the latest (partial) bucket; it should be ignored.
    native[native.length - 1] = { ...native[native.length - 1], close: 9999 };
    const report = compareDerivedToNative(oneMin, native, '10m', { ignoreLatestPartial: true });
    expect(report.ok).toBe(true);
    expect(report.ignoredLatestPartial).toBe(true);
  });

  it('flags a bucket present natively but missing from the derived series', () => {
    const oneMin = base(start, 30);
    const native = nativeAgg(oneMin, 10);
    native.push({ time: start + 100 * MIN, open: 1, high: 1, low: 1, close: 1, volume: 1 });
    const report = compareDerivedToNative(oneMin, native, '10m', { ignoreLatestPartial: false });
    expect(report.mismatches.some((m) => m.field === 'missing-derived')).toBe(true);
  });

  it('returns ok:false with a reason when derivation itself fails', () => {
    const dupes: Candle[] = [
      { time: start, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      { time: start, open: 1, high: 1, low: 1, close: 1, volume: 1 }, // duplicate time
    ];
    const report = compareDerivedToNative(dupes, [], '10m');
    expect(report.ok).toBe(false);
    expect(report.reason).toBeTruthy();
  });

  it('tolerates volume drift within volumeTolerance', () => {
    const oneMin = base(start, 20);
    const native = nativeAgg(oneMin, 10);
    native[0] = { ...native[0], volume: native[0].volume * (1 + 5e-4) }; // < 1e-3
    const report = compareDerivedToNative(oneMin, native, '10m', { ignoreLatestPartial: false });
    expect(report.ok).toBe(true);
  });
});

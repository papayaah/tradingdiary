import { describe, it, expect } from 'vitest';
import { findPivots, detectCupAndHandle, detectHeadAndShoulders, detectDoubleTopBottom, detectAllPatterns, CandleData } from './index';

describe('Chart Pattern Recognition Engine', () => {
  it('identifies swing high peaks and swing low troughs correctly', () => {
    const candles: CandleData[] = [
      { time: 1, open: 100, high: 101, low: 99, close: 100 },
      { time: 2, open: 100, high: 102, low: 98, close: 101 },
      { time: 3, open: 101, high: 105, low: 100, close: 104 }, // Swing High Peak
      { time: 4, open: 104, high: 103, low: 97, close: 98 },
      { time: 5, open: 98, high: 99, low: 92, close: 93 }, // Swing Low Trough
      { time: 6, open: 93, high: 96, low: 93, close: 95 },
      { time: 7, open: 95, high: 97, low: 94, close: 96 },
    ];

    const pivots = findPivots(candles, 2);
    expect(pivots.length).toBeGreaterThan(0);
    const high = pivots.find((p) => p.type === 'high');
    const low = pivots.find((p) => p.type === 'low');

    expect(high?.price).toBe(105);
    expect(low?.price).toBe(92);
  });

  it('detects Double Bottom (W) pattern correctly', () => {
    const candles: CandleData[] = [];
    const baseTime = 1700000000;

    // Synthetic W Pattern
    const prices = [
      100, 95, 90, 85, 80, // Trough 1
      85, 92, 95, // Middle Peak
      90, 85, 81, // Trough 2 (Matches Trough 1)
      86, 92, 98, 102, // Breakout
    ];

    prices.forEach((price, idx) => {
      candles.push({
        time: baseTime + idx * 86400,
        open: price - 1,
        high: price + 1,
        low: price - 1,
        close: price,
      });
    });

    const wPatterns = detectDoubleTopBottom(candles);
    expect(wPatterns.length).toBeGreaterThan(0);
    expect(wPatterns[0].name).toBe('Double Bottom (W)');
    expect(wPatterns[0].type).toBe('bullish');
    expect(wPatterns[0].targetPrice).toBeGreaterThan(wPatterns[0].breakoutPrice);
  });

  it('detects Head & Shoulders pattern correctly', () => {
    const candles: CandleData[] = [];
    const baseTime = 1700000000;

    // Synthetic Head & Shoulders Pattern
    const prices = [
      100, 110, 120, 110, 100, // Left Shoulder (120)
      110, 125, 135, 125, 100, // Head (135)
      110, 119, 120, 110, 95,  // Right Shoulder (120)
    ];

    prices.forEach((price, idx) => {
      candles.push({
        time: baseTime + idx * 86400,
        open: price - 1,
        high: price + 1,
        low: price - 1,
        close: price,
      });
    });

    const hsPatterns = detectHeadAndShoulders(candles);
    expect(hsPatterns.length).toBeGreaterThan(0);
    expect(hsPatterns[0].name).toBe('Head & Shoulders');
    expect(hsPatterns[0].type).toBe('bearish');
  });

  it('runs unified detectAllPatterns without throwing errors', () => {
    const candles: CandleData[] = Array.from({ length: 30 }, (_, i) => ({
      time: 1700000000 + i * 86400,
      open: 100 + Math.sin(i / 2) * 10,
      high: 102 + Math.sin(i / 2) * 10,
      low: 98 + Math.sin(i / 2) * 10,
      close: 101 + Math.sin(i / 2) * 10,
    }));

    const result = detectAllPatterns(candles);
    expect(result).toHaveProperty('patterns');
    expect(result).toHaveProperty('totalDetected');
  });
});

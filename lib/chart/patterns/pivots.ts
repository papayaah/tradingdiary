export interface CandleData {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface PivotPoint {
  index: number;
  time: number;
  price: number;
  type: 'high' | 'low';
}

/**
 * Finds local swing high peaks and swing low troughs in a candle series.
 * A candle at index `i` is a Swing High if its High is >= all candles within `window` before and after.
 * A candle at index `i` is a Swing Low if its Low is <= all candles within `window` before and after.
 */
export function findPivots(candles: CandleData[], windowSize: number = 3): PivotPoint[] {
  if (candles.length < windowSize * 2 + 1) return [];

  const pivots: PivotPoint[] = [];

  for (let i = windowSize; i < candles.length - windowSize; i++) {
    const current = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let offset = -windowSize; offset <= windowSize; offset++) {
      if (offset === 0) continue;
      const neighbor = candles[i + offset];

      if (neighbor.high > current.high) isHigh = false;
      if (neighbor.low < current.low) isLow = false;
    }

    if (isHigh) {
      pivots.push({
        index: i,
        time: current.time,
        price: current.high,
        type: 'high',
      });
    }

    if (isLow) {
      pivots.push({
        index: i,
        time: current.time,
        price: current.low,
        type: 'low',
      });
    }
  }

  return pivots;
}

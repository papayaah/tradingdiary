import { CandleData, PivotPoint, findPivots } from './pivots';

export interface DoubleTopBottomResult {
  id: string;
  name: 'Double Bottom (W)' | 'Double Top (M)';
  type: 'bullish' | 'bearish';
  startIndex: number;
  endIndex: number;
  firstPivot: PivotPoint;
  middlePivot: PivotPoint;
  secondPivot: PivotPoint;
  breakoutPrice: number;
  targetPrice: number;
  stopLossPrice: number;
  confidence: number;
}

const MAX_PIVOT_SPACING = 60;
const MIN_PIVOT_SPACING = 5;
const MAX_LEVEL_DIFFERENCE_RATIO = 0.25;
const STOP_BUFFER_RATIO = 0.1;

function highestPivotBetween(pivots: PivotPoint[], startIndex: number, endIndex: number) {
  return pivots
    .filter((pivot) => pivot.index > startIndex && pivot.index < endIndex)
    .reduce<PivotPoint | null>((highest, pivot) =>
      !highest || pivot.price > highest.price ? pivot : highest, null);
}

function lowestPivotBetween(pivots: PivotPoint[], startIndex: number, endIndex: number) {
  return pivots
    .filter((pivot) => pivot.index > startIndex && pivot.index < endIndex)
    .reduce<PivotPoint | null>((lowest, pivot) =>
      !lowest || pivot.price < lowest.price ? pivot : lowest, null);
}

export function detectDoubleTopBottom(candles: CandleData[]): DoubleTopBottomResult[] {
  if (candles.length < 15) return [];

  const pivots = findPivots(candles, 3);
  const highPivots = pivots.filter((p) => p.type === 'high');
  const lowPivots = pivots.filter((p) => p.type === 'low');

  const results: DoubleTopBottomResult[] = [];

  // 1. Double Bottom (W)
  for (let i = 0; i < lowPivots.length - 1; i++) {
    const p1 = lowPivots[i];
    const p2 = lowPivots[i + 1];

    const indexDiff = p2.index - p1.index;
    if (indexDiff < MIN_PIVOT_SPACING || indexDiff > MAX_PIVOT_SPACING) continue;

    // The neckline is the highest swing high between the two bottoms.
    const peak = highestPivotBetween(highPivots, p1.index, p2.index);
    if (!peak) continue;

    const breakoutPrice = Number(peak.price.toFixed(2));
    const lowerBottom = Math.min(p1.price, p2.price);
    const depth = breakoutPrice - lowerBottom;
    if (depth <= 0) continue;

    // Compare the lows to the formation's height, not the instrument price.
    // This prevents shallow intraday wiggles from scoring as high-quality Ws.
    const levelDifferenceRatio = Math.abs(p1.price - p2.price) / depth;
    if (levelDifferenceRatio > MAX_LEVEL_DIFFERENCE_RATIO) continue;

    // A double bottom is only complete after a later candle closes above its neckline.
    const breakoutCandle = candles.find((candle, index) => index > p2.index && candle.close > breakoutPrice);
    if (!breakoutCandle) continue;

    const targetPrice = Number((breakoutPrice + depth).toFixed(2));
    const stopLossPrice = Number((lowerBottom - depth * STOP_BUFFER_RATIO).toFixed(2));
    const confidence = Math.round(Math.max(65, 95 - levelDifferenceRatio * 40));

    results.push({
      id: `w-${p1.index}-${p2.index}`,
      name: 'Double Bottom (W)',
      type: 'bullish',
      startIndex: p1.index,
      endIndex: p2.index,
      firstPivot: p1,
      middlePivot: peak,
      secondPivot: p2,
      breakoutPrice,
      targetPrice,
      stopLossPrice,
      confidence,
    });
  }

  // 2. Double Top (M)
  for (let i = 0; i < highPivots.length - 1; i++) {
    const p1 = highPivots[i];
    const p2 = highPivots[i + 1];

    const indexDiff = p2.index - p1.index;
    if (indexDiff < MIN_PIVOT_SPACING || indexDiff > MAX_PIVOT_SPACING) continue;

    // The neckline is the lowest swing low between the two tops.
    const trough = lowestPivotBetween(lowPivots, p1.index, p2.index);
    if (!trough) continue;

    const breakoutPrice = Number(trough.price.toFixed(2));
    const higherTop = Math.max(p1.price, p2.price);
    const height = higherTop - breakoutPrice;
    if (height <= 0) continue;

    const levelDifferenceRatio = Math.abs(p1.price - p2.price) / height;
    if (levelDifferenceRatio > MAX_LEVEL_DIFFERENCE_RATIO) continue;

    const breakoutCandle = candles.find((candle, index) => index > p2.index && candle.close < breakoutPrice);
    if (!breakoutCandle) continue;

    const targetPrice = Number((breakoutPrice - height).toFixed(2));
    const stopLossPrice = Number((higherTop + height * STOP_BUFFER_RATIO).toFixed(2));
    const confidence = Math.round(Math.max(65, 95 - levelDifferenceRatio * 40));

    results.push({
      id: `m-${p1.index}-${p2.index}`,
      name: 'Double Top (M)',
      type: 'bearish',
      startIndex: p1.index,
      endIndex: p2.index,
      firstPivot: p1,
      middlePivot: trough,
      secondPivot: p2,
      breakoutPrice,
      targetPrice,
      stopLossPrice,
      confidence,
    });
  }

  return results.slice(-3);
}

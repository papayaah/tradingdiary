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

    const diffPercent = Math.abs(p1.price - p2.price) / p1.price;
    if (diffPercent > 0.035) continue; // Bottoms must match within 3.5%

    const indexDiff = p2.index - p1.index;
    if (indexDiff < 5 || indexDiff > 60) continue;

    // Find peak between the two bottoms
    const peak = highPivots.find((p) => p.index > p1.index && p.index < p2.index);
    if (!peak) continue;

    const breakoutPrice = Number(peak.price.toFixed(2));
    const depth = breakoutPrice - Math.min(p1.price, p2.price);
    const targetPrice = Number((breakoutPrice + depth).toFixed(2));
    const stopLossPrice = Number((Math.min(p1.price, p2.price) * 0.99).toFixed(2));
    const confidence = Math.round(Math.max(65, 95 - diffPercent * 600));

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

    const diffPercent = Math.abs(p1.price - p2.price) / p1.price;
    if (diffPercent > 0.035) continue; // Tops must match within 3.5%

    const indexDiff = p2.index - p1.index;
    if (indexDiff < 5 || indexDiff > 60) continue;

    // Find trough between the two tops
    const trough = lowPivots.find((p) => p.index > p1.index && p.index < p2.index);
    if (!trough) continue;

    const breakoutPrice = Number(trough.price.toFixed(2));
    const height = Math.max(p1.price, p2.price) - breakoutPrice;
    const targetPrice = Number((breakoutPrice - height).toFixed(2));
    const stopLossPrice = Number((Math.max(p1.price, p2.price) * 1.01).toFixed(2));
    const confidence = Math.round(Math.max(65, 95 - diffPercent * 600));

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

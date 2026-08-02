import { CandleData, PivotPoint, findPivots } from './pivots';

export interface HeadAndShouldersResult {
  id: string;
  name: 'Head & Shoulders' | 'Inverse Head & Shoulders';
  type: 'bearish' | 'bullish';
  startIndex: number;
  endIndex: number;
  leftShoulder: PivotPoint;
  head: PivotPoint;
  rightShoulder: PivotPoint;
  necklinePrice: number;
  breakoutPrice: number;
  targetPrice: number;
  stopLossPrice: number;
  confidence: number;
}

export function detectHeadAndShoulders(candles: CandleData[]): HeadAndShouldersResult[] {
  if (candles.length < 12) return [];

  const pivots = findPivots(candles, 2);
  const highPivots = pivots.filter((p) => p.type === 'high');
  const lowPivots = pivots.filter((p) => p.type === 'low');

  const results: HeadAndShouldersResult[] = [];

  // 1. Regular Head & Shoulders (Bearish)
  for (let i = 0; i < highPivots.length - 2; i++) {
    const leftShoulder = highPivots[i];
    const head = highPivots[i + 1];
    const rightShoulder = highPivots[i + 2];

    // Head must be strictly higher than both shoulders
    if (head.price <= leftShoulder.price * 1.01 || head.price <= rightShoulder.price * 1.01) continue;

    // Shoulders must be at similar prices (within 6%)
    const shoulderDiffPercent = Math.abs(leftShoulder.price - rightShoulder.price) / leftShoulder.price;
    if (shoulderDiffPercent > 0.06) continue;

    // Find lowest candle between left shoulder and head, and between head and right shoulder
    const range1 = candles.slice(leftShoulder.index, head.index + 1);
    const range2 = candles.slice(head.index, rightShoulder.index + 1);
    if (range1.length < 2 || range2.length < 2) continue;

    const min1 = Math.min(...range1.map((c) => c.low));
    const min2 = Math.min(...range2.map((c) => c.low));

    const necklinePrice = Number(((min1 + min2) / 2).toFixed(2));
    const headHeight = head.price - necklinePrice;
    if (headHeight <= 0) continue;

    const targetPrice = Number((necklinePrice - headHeight).toFixed(2));
    const stopLossPrice = Number((head.price * 1.01).toFixed(2));

    const confidence = Math.round(Math.max(60, 95 - shoulderDiffPercent * 500));

    results.push({
      id: `hs-${leftShoulder.index}-${rightShoulder.index}`,
      name: 'Head & Shoulders',
      type: 'bearish',
      startIndex: leftShoulder.index,
      endIndex: rightShoulder.index,
      leftShoulder,
      head,
      rightShoulder,
      necklinePrice,
      breakoutPrice: necklinePrice,
      targetPrice,
      stopLossPrice,
      confidence,
    });
  }

  // 2. Inverse Head & Shoulders (Bullish)
  for (let i = 0; i < lowPivots.length - 2; i++) {
    const leftShoulder = lowPivots[i];
    const head = lowPivots[i + 1];
    const rightShoulder = lowPivots[i + 2];

    // Head must be strictly lower than both shoulders
    if (head.price >= leftShoulder.price * 0.99 || head.price >= rightShoulder.price * 0.99) continue;

    // Shoulders must be at similar prices (within 6%)
    const shoulderDiffPercent = Math.abs(leftShoulder.price - rightShoulder.price) / leftShoulder.price;
    if (shoulderDiffPercent > 0.06) continue;

    // Find highest candle between left shoulder and head, and between head and right shoulder
    const range1 = candles.slice(leftShoulder.index, head.index + 1);
    const range2 = candles.slice(head.index, rightShoulder.index + 1);
    if (range1.length < 2 || range2.length < 2) continue;

    const max1 = Math.max(...range1.map((c) => c.high));
    const max2 = Math.max(...range2.map((c) => c.high));

    const necklinePrice = Number(((max1 + max2) / 2).toFixed(2));
    const headDepth = necklinePrice - head.price;
    if (headDepth <= 0) continue;

    const targetPrice = Number((necklinePrice + headDepth).toFixed(2));
    const stopLossPrice = Number((head.price * 0.99).toFixed(2));

    const confidence = Math.round(Math.max(60, 95 - shoulderDiffPercent * 500));

    results.push({
      id: `ihs-${leftShoulder.index}-${rightShoulder.index}`,
      name: 'Inverse Head & Shoulders',
      type: 'bullish',
      startIndex: leftShoulder.index,
      endIndex: rightShoulder.index,
      leftShoulder,
      head,
      rightShoulder,
      necklinePrice,
      breakoutPrice: necklinePrice,
      targetPrice,
      stopLossPrice,
      confidence,
    });
  }

  return results.slice(-3);
}

import { CandleData, PivotPoint, findPivots } from './pivots';

export interface CupAndHandleResult {
  id: string;
  name: string; // 'Cup & Handle'
  startIndex: number;
  endIndex: number;
  leftRim: PivotPoint;
  bottom: PivotPoint;
  rightRim: PivotPoint;
  handleBottom?: PivotPoint;
  breakoutPrice: number;
  targetPrice: number;
  stopLossPrice: number;
  confidence: number; // 0 to 100
}

/**
 * Detects Cup & Handle patterns in a candle series.
 */
export function detectCupAndHandle(candles: CandleData[]): CupAndHandleResult[] {
  if (candles.length < 20) return [];

  const pivots = findPivots(candles, 3);
  const highPivots = pivots.filter((p) => p.type === 'high');
  const lowPivots = pivots.filter((p) => p.type === 'low');

  const results: CupAndHandleResult[] = [];

  for (let i = 0; i < highPivots.length - 1; i++) {
    const leftRim = highPivots[i];

    for (let j = i + 1; j < highPivots.length; j++) {
      const rightRim = highPivots[j];

      // Distance between rims should be at least 10 candles and at most 120 candles
      const indexDiff = rightRim.index - leftRim.index;
      if (indexDiff < 10 || indexDiff > 120) continue;

      // Rim heights should match within 4%
      const priceDiffPercent = Math.abs(leftRim.price - rightRim.price) / leftRim.price;
      if (priceDiffPercent > 0.04) continue;

      // Find the deepest low pivot between the two rims (Cup Bottom)
      const cupLows = lowPivots.filter((p) => p.index > leftRim.index && p.index < rightRim.index);
      if (cupLows.length === 0) continue;

      const bottom = cupLows.reduce((min, p) => (p.price < min.price ? p : min), cupLows[0]);

      // Cup depth should be between 10% and 50%
      const averageRimPrice = (leftRim.price + rightRim.price) / 2;
      const depthPercent = (averageRimPrice - bottom.price) / averageRimPrice;
      if (depthPercent < 0.08 || depthPercent > 0.50) continue;

      // Check handle consolidation after right rim
      const handleCandles = candles.slice(rightRim.index);
      let handleBottom: PivotPoint | undefined = undefined;

      if (handleCandles.length > 2) {
        const handleLows = lowPivots.filter((p) => p.index > rightRim.index);
        if (handleLows.length > 0) {
          handleBottom = handleLows[0];
          // Handle depth should not exceed 50% of the cup depth
          const handlePullbackPercent = (rightRim.price - handleBottom.price) / rightRim.price;
          if (handlePullbackPercent > depthPercent * 0.5) continue;
        }
      }

      const breakoutPrice = Number(averageRimPrice.toFixed(2));
      const cupHeight = averageRimPrice - bottom.price;
      const targetPrice = Number((breakoutPrice + cupHeight).toFixed(2));
      const stopLossPrice = Number((handleBottom ? handleBottom.price : averageRimPrice - cupHeight * 0.3).toFixed(2));

      // Calculate quality confidence (0-100)
      const symmetryScore = Math.max(0, 100 - priceDiffPercent * 1000);
      const depthScore = depthPercent >= 0.15 && depthPercent <= 0.35 ? 100 : 80;
      const confidence = Math.round((symmetryScore + depthScore) / 2);

      results.push({
        id: `cup-handle-${leftRim.index}-${rightRim.index}`,
        name: 'Cup & Handle',
        startIndex: leftRim.index,
        endIndex: handleBottom ? handleBottom.index : rightRim.index,
        leftRim,
        bottom,
        rightRim,
        handleBottom,
        breakoutPrice,
        targetPrice,
        stopLossPrice,
        confidence,
      });
    }
  }

  // Return the most recent or highest confidence match
  return results.slice(-3);
}

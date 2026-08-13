import { CandleData, PivotPoint, findPivots } from './pivots';

export interface HorizontalLevel {
  type: 'support' | 'resistance';
  price: number;
  touches: number;
  firstIndex: number;
  lastIndex: number;
}

export interface AutoTrendline {
  type: 'rising-support' | 'falling-resistance';
  startIndex: number;
  endIndex: number;
  startPrice: number;
  endPrice: number;
  projectedPrice: number;
  touches: number;
}

export interface MarketStructure {
  levels: HorizontalLevel[];
  trendlines: AutoTrendline[];
}

function priceTolerance(candles: CandleData[]): number {
  const range = Math.max(...candles.map((candle) => candle.high)) - Math.min(...candles.map((candle) => candle.low));
  const averageWickRange = candles.reduce((sum, candle) => sum + candle.high - candle.low, 0) / candles.length;
  return Math.max(range * 0.006, averageWickRange * 0.35);
}

function detectLevels(pivots: PivotPoint[], tolerance: number): HorizontalLevel[] {
  const clusters: Array<{ type: 'support' | 'resistance'; pivots: PivotPoint[] }> = [];

  for (const pivot of pivots) {
    const type = pivot.type === 'low' ? 'support' : 'resistance';
    const cluster = clusters.find((candidate) =>
      candidate.type === type &&
      Math.abs(candidate.pivots.reduce((sum, point) => sum + point.price, 0) / candidate.pivots.length - pivot.price) <= tolerance,
    );
    if (cluster) cluster.pivots.push(pivot);
    else clusters.push({ type, pivots: [pivot] });
  }

  return clusters
    .filter((cluster) => cluster.pivots.length >= 2)
    .map((cluster) => ({
      type: cluster.type,
      price: cluster.pivots.reduce((sum, pivot) => sum + pivot.price, 0) / cluster.pivots.length,
      touches: cluster.pivots.length,
      firstIndex: cluster.pivots[0].index,
      lastIndex: cluster.pivots[cluster.pivots.length - 1].index,
    }))
    .sort((a, b) => b.touches - a.touches || b.lastIndex - a.lastIndex)
    .filter((level, index, levels) => levels.slice(0, index).filter((other) => other.type === level.type).length < 2);
}

function detectTrendline(
  candles: CandleData[],
  pivots: PivotPoint[],
  pivotType: PivotPoint['type'],
  tolerance: number,
): AutoTrendline | null {
  const candidates = pivots.filter((pivot) => pivot.type === pivotType);
  let best: AutoTrendline | null = null;

  for (let first = 0; first < candidates.length - 1; first++) {
    for (let second = first + 1; second < candidates.length; second++) {
      const start = candidates[first];
      const end = candidates[second];
      if (end.index - start.index < 5) continue;
      const slope = (end.price - start.price) / (end.index - start.index);
      if ((pivotType === 'low' && slope <= 0) || (pivotType === 'high' && slope >= 0)) continue;

      const lineAt = (index: number) => start.price + slope * (index - start.index);
      const touches = candidates.filter((pivot) =>
        pivot.index >= start.index && Math.abs(pivot.price - lineAt(pivot.index)) <= tolerance,
      ).length;
      if (touches < 2) continue;

      // Body closes beyond the wick-derived line invalidate it; small wick overshoots are allowed.
      const invalid = candles.some((candle, index) => {
        if (index < start.index) return false;
        const linePrice = lineAt(index);
        return pivotType === 'low'
          ? Math.max(candle.open, candle.close) < linePrice - tolerance
          : Math.min(candle.open, candle.close) > linePrice + tolerance;
      });
      if (invalid) continue;

      const trendline: AutoTrendline = {
        type: pivotType === 'low' ? 'rising-support' : 'falling-resistance',
        startIndex: start.index,
        endIndex: end.index,
        startPrice: start.price,
        endPrice: end.price,
        projectedPrice: lineAt(candles.length - 1),
        touches,
      };
      if (!best || trendline.touches > best.touches || (trendline.touches === best.touches && trendline.startIndex > best.startIndex)) {
        best = trendline;
      }
    }
  }
  return best;
}

export function detectMarketStructure(candles: CandleData[]): MarketStructure {
  if (candles.length < 15) return { levels: [], trendlines: [] };
  const pivots = findPivots(candles, 3);
  const tolerance = priceTolerance(candles);
  const trendlines = [
    detectTrendline(candles, pivots, 'low', tolerance),
    detectTrendline(candles, pivots, 'high', tolerance),
  ].filter((line): line is AutoTrendline => line !== null);
  return { levels: detectLevels(pivots, tolerance), trendlines };
}

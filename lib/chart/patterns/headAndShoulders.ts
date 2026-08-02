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
  trough1: PivotPoint;
  trough2: PivotPoint;
  necklinePrice: number;
  breakoutPrice: number;
  targetPrice: number;
  stopLossPrice: number;
  confidence: number;
}

// Head must clear the taller shoulder by at least this much — filters trivial
// adjacent bumps that aren't a real head.
const HEAD_PROMINENCE = 0.03;
// Shoulders must sit at similar prices.
const SHOULDER_PRICE_TOL = 0.08;
// Head must be roughly time-centered between the shoulders (min/max span ratio).
const TIME_SYMMETRY_MIN = 0.4;

/**
 * Detect Head & Shoulders (and inverse) without requiring the three peaks to be
 * *adjacent* pivots. A broad/rounded top has many minor pivots between the real
 * shoulders and head, so the classic "consecutive triple" approach misses it.
 * Instead, for every (left, head, right) triple we require the head to be the
 * most extreme pivot *between* the shoulders, prominent enough, and roughly
 * symmetric in both price and time — then keep the best, non-overlapping ones.
 */
export function detectHeadAndShoulders(candles: CandleData[]): HeadAndShouldersResult[] {
  if (candles.length < 12) return [];

  const pivots = findPivots(candles, 2);
  const highPivots = pivots.filter((p) => p.type === 'high');
  const lowPivots = pivots.filter((p) => p.type === 'low');

  const bearish = scanTriples(candles, highPivots, 'bearish');
  const bullish = scanTriples(candles, lowPivots, 'bullish');

  // Best first, then drop overlapping duplicates within each orientation.
  const ranked = [...bearish, ...bullish].sort((a, b) => b.confidence - a.confidence);
  const kept: HeadAndShouldersResult[] = [];
  for (const cand of ranked) {
    const overlaps = kept.some(
      (k) =>
        k.type === cand.type &&
        cand.startIndex <= k.endIndex &&
        cand.endIndex >= k.startIndex,
    );
    if (!overlaps) kept.push(cand);
  }
  return kept.slice(0, 3);
}

function scanTriples(
  candles: CandleData[],
  shoulders: PivotPoint[],
  orientation: 'bearish' | 'bullish',
): HeadAndShouldersResult[] {
  const results: HeadAndShouldersResult[] = [];
  const isTop = orientation === 'bearish';

  for (let i = 0; i < shoulders.length - 2; i++) {
    for (let j = i + 1; j < shoulders.length - 1; j++) {
      for (let k = j + 1; k < shoulders.length; k++) {
        const leftShoulder = shoulders[i];
        const head = shoulders[j];
        const rightShoulder = shoulders[k];

        // Head is the most extreme pivot strictly between the two shoulders —
        // this is what lets us skip the minor bumps in a broad top/bottom.
        let headIsExtreme = true;
        for (let m = i; m <= k; m++) {
          if (m === j) continue;
          if (isTop && shoulders[m].price >= head.price) { headIsExtreme = false; break; }
          if (!isTop && shoulders[m].price <= head.price) { headIsExtreme = false; break; }
        }
        if (!headIsExtreme) continue;

        // Head prominence over the *taller* (top) / *lower* (bottom) shoulder.
        const tallerShoulder = isTop
          ? Math.max(leftShoulder.price, rightShoulder.price)
          : Math.min(leftShoulder.price, rightShoulder.price);
        const prominence = isTop
          ? (head.price - tallerShoulder) / head.price
          : (tallerShoulder - head.price) / tallerShoulder;
        if (prominence < HEAD_PROMINENCE) continue;

        // Shoulders at similar prices.
        const shoulderDiffPercent =
          Math.abs(leftShoulder.price - rightShoulder.price) / leftShoulder.price;
        if (shoulderDiffPercent > SHOULDER_PRICE_TOL) continue;

        // Head roughly centered in time between the shoulders.
        const leftSpan = head.index - leftShoulder.index;
        const rightSpan = rightShoulder.index - head.index;
        if (leftSpan <= 0 || rightSpan <= 0) continue;
        const timeSymmetry = Math.min(leftSpan, rightSpan) / Math.max(leftSpan, rightSpan);
        if (timeSymmetry < TIME_SYMMETRY_MIN) continue;

        // Neckline from the two inner reversals (troughs for a top, peaks for a
        // bottom) between shoulder→head and head→shoulder.
        const inner1 = isTop
          ? lowestLow(candles, leftShoulder.index, head.index)
          : highestHigh(candles, leftShoulder.index, head.index);
        const inner2 = isTop
          ? lowestLow(candles, head.index, rightShoulder.index)
          : highestHigh(candles, head.index, rightShoulder.index);
        if (!inner1 || !inner2) continue;

        const necklinePrice = Number(((inner1.price + inner2.price) / 2).toFixed(2));

        // Shoulders must actually stand above (top) / below (bottom) the neckline.
        if (isTop && (leftShoulder.price <= necklinePrice || rightShoulder.price <= necklinePrice)) continue;
        if (!isTop && (leftShoulder.price >= necklinePrice || rightShoulder.price >= necklinePrice)) continue;

        const headSize = isTop ? head.price - necklinePrice : necklinePrice - head.price;
        if (headSize <= 0) continue;

        const targetPrice = Number(
          (isTop ? necklinePrice - headSize : necklinePrice + headSize).toFixed(2),
        );
        const stopLossPrice = Number(
          (isTop ? head.price * 1.01 : head.price * 0.99).toFixed(2),
        );

        // Confidence blends price symmetry, head prominence and time symmetry.
        const symScore = 1 - shoulderDiffPercent / SHOULDER_PRICE_TOL; // 0..1
        const confidence = Math.round(
          Math.max(60, Math.min(97, 70 + symScore * 10 + Math.min(prominence, 0.2) * 70 + timeSymmetry * 6)),
        );

        results.push({
          id: `${isTop ? 'hs' : 'ihs'}-${leftShoulder.index}-${rightShoulder.index}`,
          name: isTop ? 'Head & Shoulders' : 'Inverse Head & Shoulders',
          type: orientation,
          startIndex: leftShoulder.index,
          endIndex: rightShoulder.index,
          leftShoulder,
          head,
          rightShoulder,
          trough1: inner1,
          trough2: inner2,
          necklinePrice,
          breakoutPrice: necklinePrice,
          targetPrice,
          stopLossPrice,
          confidence,
        });
      }
    }
  }

  return results;
}

function lowestLow(candles: CandleData[], from: number, to: number): PivotPoint | null {
  if (to <= from) return null;
  let best = candles[from];
  let bestIndex = from;
  for (let i = from; i <= to; i++) {
    if (candles[i].low < best.low) {
      best = candles[i];
      bestIndex = i;
    }
  }
  return { index: bestIndex, price: best.low, time: best.time, type: 'low' };
}

function highestHigh(candles: CandleData[], from: number, to: number): PivotPoint | null {
  if (to <= from) return null;
  let best = candles[from];
  let bestIndex = from;
  for (let i = from; i <= to; i++) {
    if (candles[i].high > best.high) {
      best = candles[i];
      bestIndex = i;
    }
  }
  return { index: bestIndex, price: best.high, time: best.time, type: 'high' };
}

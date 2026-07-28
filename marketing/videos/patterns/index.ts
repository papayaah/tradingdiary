import { consecutivePromo } from './consecutive';
import { engulfingReversalPromo } from './engulfing-reversal';
import { momentumBurstPromo } from './momentum-burst';
import { rangeBreakoutPromo } from './range-breakout';
import { volumeExpansionPromo } from './volume-expansion';

export const patternPromos = [
  consecutivePromo,
  momentumBurstPromo,
  rangeBreakoutPromo,
  volumeExpansionPromo,
  engulfingReversalPromo,
];

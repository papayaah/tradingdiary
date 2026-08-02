import type { PatternId } from '@/lib/scanner/patterns';

export interface DetectorRuleGuidance {
  minBodySummaryLabel: string;
  minBodyLabel: string;
  minBodyExplanation: string;
  currentRules: Array<{ label: string; value: string }>;
  recommendedControls: string[];
}

export const DETECTOR_RULE_GUIDANCE: Record<PatternId, DetectorRuleGuidance> = {
  consecutive: {
    minBodySummaryLabel: 'Each Body',
    minBodyLabel: 'Minimum Body per Candle',
    minBodyExplanation: 'Every candle in the selected streak must meet this open-to-close percentage.',
    currentRules: [
      { label: 'Direction', value: 'Every bar must have the same color' },
      { label: 'Progression', value: 'Every close must move higher or lower' },
      { label: 'Streak', value: 'Configurable: 3–5 candles' },
      { label: 'Body overlap', value: 'Configurable staircase limit' },
    ],
    recommendedControls: [
      'Optional minimum total streak move',
      'Optional maximum opposite wick ratio',
    ],
  },
  'momentum-burst': {
    minBodySummaryLabel: 'Signal Body',
    minBodyLabel: 'Minimum Signal Body',
    minBodyExplanation: 'The burst candle must meet this absolute open-to-close percentage.',
    currentRules: [
      { label: 'Baseline', value: 'Configurable prior-body average' },
      { label: 'Relative size', value: 'Configurable body-expansion multiplier' },
      { label: 'Direction', value: 'Signal follows the burst candle color' },
    ],
    recommendedControls: [
      'Optional ATR-normalized minimum',
    ],
  },
  'range-breakout': {
    minBodySummaryLabel: 'Signal Body',
    minBodyLabel: 'Minimum Breakout-Candle Body',
    minBodyExplanation: 'The candle that closes outside the range must meet this open-to-close percentage.',
    currentRules: [
      { label: 'Range', value: 'Configurable prior-bar highs and lows' },
      { label: 'Confirmation', value: 'Close beyond the prior high or low' },
      { label: 'Breakout buffer', value: 'Configurable minimum close distance' },
      { label: 'Volume', value: 'Optional relative-volume confirmation' },
    ],
    recommendedControls: [
      'One alert per range instead of repeated rolling breaks',
      'Optional ATR-normalized breakout buffer',
    ],
  },
  'volume-expansion': {
    minBodySummaryLabel: 'Signal Body',
    minBodyLabel: 'Minimum Signal Body',
    minBodyExplanation: 'The high-volume candle must also make this minimum directional price move.',
    currentRules: [
      { label: 'Volume baseline', value: 'Configurable prior-bar average' },
      { label: 'Coverage', value: 'Configurable positive-volume requirement' },
      { label: 'Expansion', value: 'Configurable relative-volume multiplier' },
    ],
    recommendedControls: [
      'Same-time-of-session volume baseline',
      'Provider/feed volume capability indicator',
    ],
  },
  'engulfing-reversal': {
    minBodySummaryLabel: 'Signal Body',
    minBodyLabel: 'Minimum Engulfing Body',
    minBodyExplanation: 'The second, reversing candle must meet this open-to-close percentage.',
    currentRules: [
      { label: 'Window', value: 'Two candles' },
      { label: 'Direction', value: 'Second candle must be the opposite color' },
      { label: 'Engulfing', value: 'Second body must fully contain the first body' },
    ],
    recommendedControls: [
      'Minimum prior-candle body or range',
      'Minimum engulfing-body ratio',
      'Optional wick/rejection requirement',
      'Optional trend or support/resistance context',
    ],
  },
};

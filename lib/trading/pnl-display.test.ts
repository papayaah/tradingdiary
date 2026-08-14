import { describe, expect, it } from 'vitest';
import type { AggregatedTrade } from './aggregator';
import { getTradePnlDisplay } from './pnl-display';

const hkdTrade = {
  currency: 'HKD',
  nativeNetPnL: 770,
  netPnL: 98.12,
} as AggregatedTrade;

describe('trade P&L currency display', () => {
  it('shows native HKD first and stored USD base equivalent in the footer by default', () => {
    expect(getTradePnlDisplay(hkdTrade, 'USD', false)).toEqual({
      isConverted: true,
      primaryAmount: 770,
      primaryCurrency: 'HKD',
      secondaryAmount: 98.12,
      secondaryCurrency: 'USD',
    });
  });

  it('swaps primary and footer values when base currency is enabled', () => {
    expect(getTradePnlDisplay(hkdTrade, 'USD', true)).toEqual({
      isConverted: true,
      primaryAmount: 98.12,
      primaryCurrency: 'USD',
      secondaryAmount: 770,
      secondaryCurrency: 'HKD',
    });
  });
});

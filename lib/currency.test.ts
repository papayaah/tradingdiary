import { describe, expect, it } from 'vitest';
import { formatCurrency, getCurrencySymbol } from './currency';

describe('currency formatting', () => {
  it('uses the correct symbols for the international sample currencies', () => {
    expect(formatCurrency(20_000, 'KRW')).toBe('₩20,000.00');
    expect(formatCurrency(770, 'HKD')).toBe('HK$770.00');
    expect(formatCurrency(6_000, 'JPY')).toBe('¥6,000.00');
    expect(formatCurrency(98.12, 'USD')).toBe('$98.12');
  });

  it('shows an unknown ISO code instead of incorrectly using a dollar sign', () => {
    expect(getCurrencySymbol('ZAR')).toBe('ZAR\u00a0');
  });
});

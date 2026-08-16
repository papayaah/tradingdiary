import { describe, expect, it } from 'vitest';
import { formatExchangeTime, exchangeTimeLabel } from './exchange-time';

describe('exchange time display', () => {
  it('formats stored ET wall-clock as 12-hour with an ET label', () => {
    // Summer date -> EDT.
    expect(formatExchangeTime('15:00:00', '20260721')).toBe('3:00 PM EDT');
    expect(formatExchangeTime('09:30:00', '20260721')).toBe('9:30 AM EDT');
    expect(formatExchangeTime('13:06:53', '20260721')).toBe('1:06 PM EDT');
  });

  it('uses EST for winter dates', () => {
    expect(formatExchangeTime('10:00:00', '20260115')).toBe('10:00 AM EST');
    expect(exchangeTimeLabel('20260115')).toBe('EST');
    expect(exchangeTimeLabel('20260721')).toBe('EDT');
  });

  it('handles midnight and noon', () => {
    expect(formatExchangeTime('00:15:00', '20260721')).toBe('12:15 AM EDT');
    expect(formatExchangeTime('12:00:00', '20260721')).toBe('12:00 PM EDT');
  });
});

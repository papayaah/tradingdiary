import { describe, expect, it } from 'vitest';
import { tradingDayFor, nextTradingDay } from './trading-day';

describe('trading day derivation', () => {
  it('uses the ET calendar date for equities regardless of time', () => {
    expect(tradingDayFor('20260721', '09:30:00', 'AAPL')).toBe('20260721');
    expect(tradingDayFor('20260721', '19:30:00', 'AAPL')).toBe('20260721'); // after-hours, same day
    expect(tradingDayFor('20260721', '04:15:00', 'MSFT')).toBe('20260721'); // pre-market, same day
  });

  it('rolls CME futures at 18:00 ET to the next session day', () => {
    // Before the Globex roll → same day's session.
    expect(tradingDayFor('20260720', '16:00:00', 'MNQ=F')).toBe('20260720');
    // At/after 18:00 ET → next session day.
    expect(tradingDayFor('20260720', '18:30:00', 'MNQ=F')).toBe('20260721');
    expect(tradingDayFor('20260720', '18:00:00', 'ES=F')).toBe('20260721');
  });

  it('rolls a Sunday-evening futures open to Monday', () => {
    // 20260726 is a Sunday; the 18:00 ET open belongs to Monday's session.
    expect(tradingDayFor('20260726', '18:05:00', 'MNQ=F')).toBe('20260727');
  });

  it('accepts common futures symbol formats', () => {
    // getInstrumentDetails normalizes these to futures roots.
    expect(tradingDayFor('20260720', '18:30:00', 'MNQU6')).toBe('20260721');
    expect(tradingDayFor('20260720', '18:30:00', '/NQ')).toBe('20260721');
  });

  it('nextTradingDay skips weekends', () => {
    expect(nextTradingDay('20260724')).toBe('20260727'); // Fri -> Mon
    expect(nextTradingDay('20260720')).toBe('20260721'); // Mon -> Tue
  });
});

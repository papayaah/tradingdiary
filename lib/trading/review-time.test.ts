import { describe, expect, it } from 'vitest';
import {
  formatEtTimestamp12Hour,
  normalizeReviewDates,
  normalizeReviewPrices,
  normalizeReviewTextValues,
  normalizeReviewTimestamps,
} from './review-time';

describe('AI review time formatting', () => {
  it('formats ET timestamps with a readable date and minute-precision 12-hour clock', () => {
    expect(formatEtTimestamp12Hour(Date.UTC(2026, 5, 25, 0, 5, 9)))
      .toBe('Jun 25, 2026 at 12:05 AM ET');
    expect(formatEtTimestamp12Hour(Date.UTC(2026, 5, 25, 12, 0, 0)))
      .toBe('Jun 25, 2026 at 12:00 PM ET');
    expect(formatEtTimestamp12Hour(Date.UTC(2026, 5, 25, 13, 58, 29)))
      .toBe('Jun 25, 2026 at 1:58 PM ET');
  });

  it('normalizes timestamps throughout AI prose and omits seconds', () => {
    expect(normalizeReviewTimestamps(
      'Entered at 13:58:29 ET and scaled out between 14:02:12 and 14:02:28 ET after the 09:35 entry. Existing: 1:58 PM.',
    )).toBe(
      'Entered at 1:58 PM ET and scaled out between 2:02 PM and 2:02 PM ET after the 9:35 AM entry. Existing: 1:58 PM.',
    );
  });

  it('repairs the malformed duplicated AM/PM timestamps from prior reviews', () => {
    expect(normalizeReviewTimestamps(
      'Opened at 9:48 AM:30 AM ET and closed at 11:35 AM:42 PM ET.',
    )).toBe('Opened at 9:48 AM ET and closed at 11:35 PM ET.');
  });

  it('formats ISO dates in review prose', () => {
    expect(normalizeReviewDates('Opened on 2026-08-13 and closed on 2026-08-20.'))
      .toBe('Opened on Aug 13, 2026 and closed on Aug 20, 2026.');
  });

  it('repairs the reported summary format end to end', () => {
    expect(normalizeReviewTextValues(
      'LONG trade in JD initiated at 9:48 AM:30 AM ET on 2026-08-13 and closed at 11:35 AM:42 PM ET.',
    )).toBe(
      'LONG trade in JD initiated at 9:48 AM ET on Aug 13, 2026 and closed at 11:35 PM ET.',
    );
  });

  it('repairs an ET suffix mistakenly attached to a decimal price', () => {
    expect(normalizeReviewPrices('The trader initiated SLV at 54.16 ET.', 'USD'))
      .toBe('The trader initiated SLV at $54.16.');
    expect(normalizeReviewPrices('Entry price: EUR 48.25 ET.', 'EUR'))
      .toBe('Entry price: EUR 48.25.');
  });
});

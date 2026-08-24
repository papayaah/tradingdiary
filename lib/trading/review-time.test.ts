import { describe, expect, it } from 'vitest';
import {
  formatEtTimestamp12Hour,
  normalizeReviewPrices,
  normalizeReviewTimestamps,
} from './review-time';

describe('AI review time formatting', () => {
  it('formats ET wall-clock timestamps with a 12-hour clock', () => {
    expect(formatEtTimestamp12Hour(Date.UTC(2026, 5, 25, 0, 5, 9)))
      .toBe('2026-06-25 12:05:09 AM ET');
    expect(formatEtTimestamp12Hour(Date.UTC(2026, 5, 25, 12, 0, 0)))
      .toBe('2026-06-25 12:00:00 PM ET');
    expect(formatEtTimestamp12Hour(Date.UTC(2026, 5, 25, 13, 58, 29)))
      .toBe('2026-06-25 1:58:29 PM ET');
  });

  it('normalizes timestamps throughout AI prose and preserves existing AM/PM', () => {
    expect(normalizeReviewTimestamps(
      'Entered at 13:58:29 ET and scaled out between 14:02:12 and 14:02:28 ET after the 09:35 entry. Existing: 1:58 PM.',
    )).toBe(
      'Entered at 1:58:29 PM ET and scaled out between 2:02:12 PM and 2:02:28 PM ET after the 9:35 AM entry. Existing: 1:58 PM.',
    );
  });

  it('repairs an ET suffix mistakenly attached to a decimal price', () => {
    expect(normalizeReviewPrices('The trader initiated SLV at 54.16 ET.', 'USD'))
      .toBe('The trader initiated SLV at $54.16.');
    expect(normalizeReviewPrices('Entry price: EUR 48.25 ET.', 'EUR'))
      .toBe('Entry price: EUR 48.25.');
  });
});

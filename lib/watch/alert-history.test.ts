import { describe, expect, it } from 'vitest';
import { limitAlertHistory, MAX_ALERT_HISTORY_ITEMS } from './alert-history';

describe('limitAlertHistory', () => {
  it('keeps the newest alerts and trims only the end of the list', () => {
    expect(limitAlertHistory(['newest', 'middle', 'oldest'], 2)).toEqual([
      'newest',
      'middle',
    ]);
  });

  it('uses the shared alert-history maximum', () => {
    const alerts = Array.from({ length: MAX_ALERT_HISTORY_ITEMS + 5 }, (_, index) => index);
    expect(limitAlertHistory(alerts)).toHaveLength(MAX_ALERT_HISTORY_ITEMS);
    expect(limitAlertHistory(alerts).at(-1)).toBe(MAX_ALERT_HISTORY_ITEMS - 1);
  });
});

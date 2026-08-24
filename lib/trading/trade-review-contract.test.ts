import { describe, expect, it } from 'vitest';
import { parseTradeAnalysis } from './trade-review-contract';

describe('parseTradeAnalysis', () => {
  it('normalizes mistaken price suffixes and military timestamps before returning a review', () => {
    const analysis = parseTradeAnalysis(JSON.stringify({
      summary: 'The trader entered SLV at 54.16 ET at 13:58:29 ET.',
      observations: [{
        label: 'Entry',
        detail: 'The entry price was 54.16 ET.',
        evidence: [{ metric: 'entry price', value: '54.16 ET', source: 'METRIC' }],
      }],
      questionsForTrader: ['Was the 14:02:12 exit planned?'],
      evidenceConfidence: 'medium',
    }), 'USD');

    expect(analysis?.summary).toBe('The trader entered SLV at $54.16 at 1:58 PM ET.');
    expect(analysis?.observations[0].detail).toBe('The entry price was $54.16.');
    expect(analysis?.observations[0].evidence?.[0].value).toBe('$54.16');
    expect(analysis?.questionsForTrader?.[0]).toBe('Was the 2:02 PM exit planned?');
  });
});

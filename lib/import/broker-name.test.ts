import { describe, expect, it } from 'vitest';
import { inferBrokerName } from './broker-name';

describe('broker name inference', () => {
  it('recognizes broker branding in a filename', () => {
    expect(inferBrokerName({ filename: 'ETrade_Transactions.csv', content: 'Date,Symbol,Price' })).toBe('E*TRADE');
  });

  it('recognizes broker branding in export content', () => {
    expect(inferBrokerName({ content: 'Interactive Brokers Activity Statement\nDate,Symbol' })).toBe('IBKR');
  });

  it('does not guess when the source has no broker evidence', () => {
    expect(inferBrokerName({ filename: 'trades.csv', content: 'Date,Symbol,Price' })).toBeNull();
  });
});

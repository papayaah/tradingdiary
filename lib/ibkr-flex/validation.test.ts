import { describe, expect, it } from 'vitest';
import { normalizeFlexQueryId, normalizeFlexToken } from './validation';

describe('IBKR Flex credential validation', () => {
  it('normalizes spaces in a numeric token', () => {
    expect(normalizeFlexToken('12345 67890 12345 67890')).toBe('12345678901234567890');
  });

  it('rejects malformed values', () => {
    expect(() => normalizeFlexToken('secret')).toThrow();
    expect(() => normalizeFlexQueryId('abc')).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import type { AccountRecord } from '@/lib/db/schema';
import { getImportAccountDefaults, getRecommendedImportAccountId } from './account-defaults';

function account(overrides: Partial<AccountRecord>): AccountRecord {
  return {
    accountId: 'account-1',
    name: 'Trading Account',
    type: 'Custom',
    currency: 'USD',
    address: '',
    importedAt: 1,
    ...overrides,
  };
}

describe('import account defaults', () => {
  it('uses the auto-detected broker for a new account', () => {
    expect(getImportAccountDefaults('Charles Schwab')).toEqual({
      name: 'Charles Schwab Account',
      type: 'Charles Schwab',
      wasBrokerDetected: true,
    });
  });

  it('falls back silently for generic files', () => {
    expect(getImportAccountDefaults(null)).toEqual({
      name: 'Main Trading Account',
      type: 'Custom',
      wasBrokerDetected: false,
    });
  });

  it('selects the only account matching the detected broker and currency', () => {
    const accounts = [
      account({ accountId: 'schwab', type: 'Charles Schwab' }),
      account({ accountId: 'ibkr', type: 'Interactive Brokers', currency: 'HKD' }),
    ];

    expect(getRecommendedImportAccountId(accounts, 'IBKR', 'HKD')).toBe('ibkr');
  });

  it('creates a new account instead of choosing a mismatched first account', () => {
    const accounts = [account({ accountId: 'schwab', type: 'Charles Schwab' })];
    expect(getRecommendedImportAccountId(accounts, 'IBKR', 'USD')).toBe('new');
  });

  it('does not guess when multiple accounts match', () => {
    const accounts = [
      account({ accountId: 'ibkr-1', type: 'IBKR' }),
      account({ accountId: 'ibkr-2', type: 'Interactive Brokers' }),
    ];

    expect(getRecommendedImportAccountId(accounts, 'IBKR', 'USD')).toBe('new');
  });
});

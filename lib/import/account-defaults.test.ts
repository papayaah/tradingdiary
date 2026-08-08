import { describe, expect, it } from 'vitest';
import { getImportAccountDefaults } from './account-defaults';

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
});

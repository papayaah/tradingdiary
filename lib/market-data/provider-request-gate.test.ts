import { describe, expect, it } from 'vitest';
import { providerCredentialScope, providerScopeForName } from './provider-request-gate';

describe('provider request credential scopes', () => {
  it('uses one stable server scope for shared owner credentials', () => {
    expect(providerScopeForName('IBKR (CME)')).toBe('ibkr-cme:server');
    expect(providerCredentialScope('Tiingo', 'server-secret', 'owner')).toBe('tiingo:server');
    expect(providerCredentialScope('Tiingo Crypto', 'server-secret', 'owner')).toBe('tiingo:server');
  });

  it('shares one user credential allowance across Tiingo endpoints', () => {
    expect(providerCredentialScope('Tiingo', 'same-key', 'user')).toBe(
      providerCredentialScope('Tiingo Crypto', 'same-key', 'user'),
    );
  });

  it('partitions user credentials without exposing the raw key', () => {
    const a = providerCredentialScope('Tiingo', 'user-key-a', 'user');
    const b = providerCredentialScope('Tiingo', 'user-key-b', 'user');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^tiingo:user:[a-f0-9]{16}$/);
    expect(a).not.toContain('user-key-a');
  });
});

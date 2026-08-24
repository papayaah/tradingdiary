import { describe, expect, it } from 'vitest';
import {
  cadenceScopeFor,
  entitlementScopeFromCadence,
  assetClassFromCadence,
  resolveProviderIdentity,
} from './provider-scope';

describe('cadence scope helpers', () => {
  it('builds a per-class cadence scope from an entitlement scope', () => {
    expect(cadenceScopeFor('tiingo:server', 'crypto')).toBe('tiingo:crypto:server');
    expect(cadenceScopeFor('ibkr-cme:server', 'futures')).toBe('ibkr-cme:futures:server');
  });

  it('maps a cadence scope back to its shared entitlement scope', () => {
    expect(entitlementScopeFromCadence('tiingo:crypto:server')).toBe('tiingo:server');
    expect(entitlementScopeFromCadence('ibkr-cme:futures:server')).toBe('ibkr-cme:server');
  });

  it('extracts the asset class from a cadence scope', () => {
    expect(assetClassFromCadence('tiingo:equity:server')).toBe('equity');
    expect(assetClassFromCadence('yahoo-finance:crypto:server')).toBe('crypto');
    expect(assetClassFromCadence('tiingo:server')).toBeUndefined();
  });

  it('resolveProviderIdentity returns a shared entitlement and a per-class cadence scope', () => {
    // No provider keys in the test env → equities resolve to Yahoo.
    const equity = resolveProviderIdentity('AAPL', 'equity');
    expect(equity.cadenceScope).toBe(`${equity.providerScope.replace(/:server$/, '')}:equity:server`);
    expect(entitlementScopeFromCadence(equity.cadenceScope)).toBe(equity.providerScope);

    const crypto = resolveProviderIdentity('BTC-USD', 'crypto');
    expect(assetClassFromCadence(crypto.cadenceScope)).toBe('crypto');
  });
});

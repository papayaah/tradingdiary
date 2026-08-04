import { describe, it, expect } from 'vitest';
import { classifyAssetClass, canonicalizeSymbol, buildFetchScope } from './canonical-symbol';
import { getProviderCapability, type ProviderCapability } from './provider-capabilities';

describe('classifyAssetClass', () => {
  it('detects futures across notations', () => {
    for (const s of ['NQ=F', 'MNQU6', '/MNQ', 'NQ.C.0']) {
      expect(classifyAssetClass(s)).toBe('futures');
    }
  });
  it('detects USD crypto pairs and defaults to equity', () => {
    expect(classifyAssetClass('BTC-USD')).toBe('crypto');
    expect(classifyAssetClass('aapl')).toBe('equity');
    expect(classifyAssetClass('SPY')).toBe('equity');
  });
});

describe('canonicalizeSymbol — equity', () => {
  const cap = getProviderCapability('Tiingo', 'equity');
  it('upper-cases and trims', () => {
    expect(canonicalizeSymbol(' aapl ', 'equity', cap)).toBe('AAPL');
  });
});

describe('canonicalizeSymbol — futures collapse per provider form', () => {
  const notations = ['MNQU6', '/MNQ', 'MNQ=F', 'MNQ.C.0'];

  it('collapses every notation to Yahoo continuous form', () => {
    const cap = getProviderCapability('Yahoo Finance', 'futures');
    const canon = notations.map((s) => canonicalizeSymbol(s, 'futures', cap));
    expect(new Set(canon)).toEqual(new Set(['MNQ=F']));
  });

  it('uses the bare product root for a root-symbology provider', () => {
    const cap = getProviderCapability('Polygon.io', 'futures');
    expect(canonicalizeSymbol('MNQU6', 'futures', cap)).toBe('MNQ');
  });
});

describe('canonicalizeSymbol — crypto separators per provider form', () => {
  const variants = ['BTC-USD', 'btcusd', 'BTC/USD', ' btc-usd '];

  it('normalizes to separated form for a separated provider', () => {
    const cap = getProviderCapability('Yahoo Finance', 'crypto');
    for (const v of variants) expect(canonicalizeSymbol(v, 'crypto', cap)).toBe('BTC-USD');
  });

  it('normalizes to concatenated form for Tiingo Crypto', () => {
    const cap = getProviderCapability('Tiingo Crypto', 'crypto');
    for (const v of variants) expect(canonicalizeSymbol(v, 'crypto', cap)).toBe('BTCUSD');
  });
});

describe('getProviderCapability', () => {
  it('returns known provider entries', () => {
    const yahoo = getProviderCapability('Yahoo Finance', 'equity');
    expect(yahoo.futuresSymbology).toBe('yahoo');
    expect(yahoo.returnsVolume).toBe(true);

    const ibkr = getProviderCapability('IBKR (CME)', 'futures');
    expect(ibkr.futuresSymbology).toBe('yahoo');
  });

  it('falls back to a conservative default for an unknown provider', () => {
    const unknown = getProviderCapability('Some New Feed', 'equity');
    expect(unknown.aggregatableFrom1m).toBe(false); // never derive from an unknown base
    expect(unknown.futuresSymbology).toBe('root');
    expect(unknown.provider).toBe('Some New Feed');
  });
});

describe('buildFetchScope', () => {
  const withVolume = { returnsVolume: true } as ProviderCapability;
  const noVolume = { returnsVolume: false } as ProviderCapability;
  it('encodes volume presence so volumeless fetches never serve volume detectors', () => {
    expect(buildFetchScope(withVolume)).toBe('recent:ext:vol');
    expect(buildFetchScope(noVolume)).toBe('recent:ext:novol');
  });
});

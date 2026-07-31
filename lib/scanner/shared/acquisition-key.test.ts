import { describe, it, expect } from 'vitest';
import {
  buildAcquisitionKey,
  parseAcquisitionKey,
  canonicalSymbol,
  currentTimeBucket,
  defaultFetchScope,
  ACQUISITION_KEY_PREFIX,
  type MarketDataRequest,
} from './acquisition-key';

const req = (over: Partial<MarketDataRequest> = {}): MarketDataRequest => ({
  providerScope: 'polygon-io:server',
  canonicalSymbol: 'AAPL',
  interval: '10m',
  fetchScope: 'recent:ext',
  timeBucket: 29_000_000,
  ...over,
});

describe('buildAcquisitionKey / parseAcquisitionKey', () => {
  it('round-trips every component exactly', () => {
    const r = req();
    const parsed = parseAcquisitionKey(buildAcquisitionKey(r));
    expect(parsed).toEqual(r);
  });

  it('is prefixed and versioned', () => {
    expect(buildAcquisitionKey(req())).toContain(`${ACQUISITION_KEY_PREFIX}:`);
  });

  it('encodes components so colons/slashes in a symbol or scope cannot inject a separator', () => {
    const r = req({
      canonicalSymbol: 'BTC-USD',
      providerScope: 'polygon:user-credential:abc',
      interval: '1m',
    });
    const key = buildAcquisitionKey(r);
    // Only the structural separators remain: prefix(2) + 5 components = 7 tokens.
    expect(key.split(':')).toHaveLength(7);
    expect(parseAcquisitionKey(key)).toEqual(r);
  });

  it('produces identical keys for identical requests and distinct keys per dimension', () => {
    const base = req();
    expect(buildAcquisitionKey(base)).toBe(buildAcquisitionKey(req()));
    expect(buildAcquisitionKey(base)).not.toBe(buildAcquisitionKey(req({ interval: '1m' })));
    expect(buildAcquisitionKey(base)).not.toBe(buildAcquisitionKey(req({ timeBucket: 29_000_001 })));
    expect(buildAcquisitionKey(base)).not.toBe(
      buildAcquisitionKey(req({ providerScope: 'yahoo-finance:server' })),
    );
    expect(buildAcquisitionKey(base)).not.toBe(buildAcquisitionKey(req({ fetchScope: 'rth' })));
  });

  it('rejects a malformed key and an invalid timeBucket', () => {
    expect(() => parseAcquisitionKey('nope:v1:a:b:c:d:1')).toThrow();
    expect(() => parseAcquisitionKey('market-data:v1:a:b:c:d')).toThrow(); // too few
    expect(() => buildAcquisitionKey(req({ timeBucket: -1 }))).toThrow();
    expect(() => buildAcquisitionKey(req({ timeBucket: 1.5 }))).toThrow();
  });
});

describe('canonicalSymbol', () => {
  it('collapses case and whitespace variants', () => {
    expect(canonicalSymbol(' aapl ')).toBe('AAPL');
    expect(canonicalSymbol('AaPl')).toBe('AAPL');
  });
});

describe('currentTimeBucket', () => {
  it('advances once per bucket window', () => {
    expect(currentTimeBucket(60_000, 60_000)).toBe(1);
    expect(currentTimeBucket(119_999, 60_000)).toBe(1);
    expect(currentTimeBucket(120_000, 60_000)).toBe(2);
  });
});

describe('defaultFetchScope', () => {
  it('is a stable, non-empty constant for Phase 1', () => {
    expect(defaultFetchScope()).toBe('recent:ext');
  });
});

import { describe, expect, it } from 'vitest';
import { applyCadenceOverride, type GovernorCadenceDisplay } from './governor-display';

const automatic: GovernorCadenceDisplay = {
  cadenceSeconds: 553,
  uniqueKeys: 157,
  bindingTerm: 'formula',
  predictedReqPerHour: 1022,
  floorSeconds: 15,
  overrideSeconds: null,
};

describe('governor cadence display', () => {
  it('shows a manual cadence and its predicted request rate immediately', () => {
    expect(applyCadenceOverride(automatic, 120)).toEqual({
      ...automatic,
      cadenceSeconds: 120,
      bindingTerm: 'manual',
      predictedReqPerHour: 4710,
      overrideSeconds: 120,
    });
  });

  it('shows the provider floor when an override is faster than allowed', () => {
    expect(applyCadenceOverride(automatic, 2)).toMatchObject({
      cadenceSeconds: 15,
      bindingTerm: 'manual',
      predictedReqPerHour: 37680,
      overrideSeconds: 2,
    });
  });

  it('preserves scanner metrics when no override is active', () => {
    expect(applyCadenceOverride(automatic, null)).toEqual(automatic);
  });
});

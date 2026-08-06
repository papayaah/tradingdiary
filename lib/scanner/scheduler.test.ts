import { describe, expect, it } from 'vitest';
import { effectiveScanFrequencySeconds } from './scheduler';

describe('effectiveScanFrequencySeconds', () => {
  it('keeps a slower cadence explicitly requested by the user', () => {
    expect(effectiveScanFrequencySeconds(600, 72)).toBe(600);
  });

  it('does not let provider cadence change evaluation cadence', () => {
    expect(effectiveScanFrequencySeconds(15, 72)).toBe(15);
  });

  it('uses the requested cadence when the governor is disabled', () => {
    expect(effectiveScanFrequencySeconds(15)).toBe(15);
  });
});

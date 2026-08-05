import { describe, expect, it } from 'vitest';
import { buildMomentumBurstPreview } from './momentum-preview';

describe('buildMomentumBurstPreview', () => {
  it('derives the required signal body from the configured expansion multiplier', () => {
    const standard = buildMomentumBurstPreview(0.15, 1.8, true);
    const rare = buildMomentumBurstPreview(0.15, 4, true);

    expect(rare.requiredSignalBody).toBeGreaterThan(standard.requiredSignalBody);
    expect(rare.requiredSignalBody).toBeCloseTo(rare.averageBody * 4);
    expect(rare.passesRelativeExpansion).toBe(true);
  });

  it('marks the small-body scenario invalid against the effective threshold', () => {
    const preview = buildMomentumBurstPreview(0.15, 4, false);

    expect(preview.signalBody).toBeLessThan(preview.requiredSignalBody);
    expect(preview.passesRelativeExpansion).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { normalizePatternIds } from './registry';

describe('normalizePatternIds', () => {
  it('keeps valid unique pattern IDs in selection order', () => {
    expect(normalizePatternIds([
      'momentum-burst',
      'consecutive',
      'momentum-burst',
      'not-a-pattern',
    ])).toEqual(['momentum-burst', 'consecutive']);
  });

  it('migrates a legacy scalar pattern ID into a one-item selection', () => {
    expect(normalizePatternIds('range-breakout')).toEqual(['range-breakout']);
  });

  it('uses the requested fallback when the selection is empty or invalid', () => {
    expect(normalizePatternIds([], 'volume-expansion')).toEqual(['volume-expansion']);
    expect(normalizePatternIds(null)).toEqual(['consecutive']);
  });
});

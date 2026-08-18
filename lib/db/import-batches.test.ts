import { describe, expect, it } from 'vitest';
import { executionsToRemove } from './import-batches';

describe('executionsToRemove', () => {
  it('removes only ids the batch created that still exist', () => {
    const existing = new Set(['ex_a', 'ex_b', 'ex_c']);
    // Batch created a and b; c belongs to another import and must survive.
    expect(executionsToRemove(['ex_a', 'ex_b'], existing).sort()).toEqual(['ex_a', 'ex_b']);
  });

  it('skips ids that were already deleted', () => {
    const existing = new Set(['ex_a']);
    expect(executionsToRemove(['ex_a', 'ex_gone'], existing)).toEqual(['ex_a']);
  });

  it('never touches executions outside the batch', () => {
    const existing = new Set(['ex_a', 'ex_other']);
    expect(executionsToRemove(['ex_a'], existing)).toEqual(['ex_a']);
  });

  it('de-duplicates the batch id list', () => {
    const existing = new Set(['ex_a']);
    expect(executionsToRemove(['ex_a', 'ex_a'], existing)).toEqual(['ex_a']);
  });

  it('returns nothing for an empty batch', () => {
    expect(executionsToRemove([], new Set(['ex_a']))).toEqual([]);
  });
});

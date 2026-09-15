import { describe, expect, it, vi } from 'vitest';
import { invalidateDaySummaryAccounts } from './day-summary-state';

describe('day summary invalidation', () => {
  it('deletes each affected account marker once', async () => {
    const store = { delete: vi.fn().mockResolvedValue(undefined) };

    await invalidateDaySummaryAccounts(store, ['a', 'b', 'a']);

    expect(store.delete).toHaveBeenCalledTimes(2);
    expect(store.delete).toHaveBeenCalledWith('a');
    expect(store.delete).toHaveBeenCalledWith('b');
  });
});

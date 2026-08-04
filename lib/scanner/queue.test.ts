import { describe, it, expect } from 'vitest';
import { scanJobId, evaluateJobId } from './queue';

describe('job ids', () => {
  it('scheduled scans get a deterministic id (redelivery collapses to one job)', () => {
    expect(scanJobId('w1', 1_700_000_000)).toBe('w1_1700000000');
    expect(scanJobId('w1', 1_700_000_000)).toBe(scanJobId('w1', 1_700_000_000));
  });

  it('evaluate jobs live in a separate namespace so they never dedupe against a scheduled scan', () => {
    const at = 1_700_000_000;
    expect(evaluateJobId('w1', at)).toBe('eval_w1_1700000000');
    expect(evaluateJobId('w1', at)).not.toBe(scanJobId('w1', at));
  });

  it('contains no ":" (BullMQ forbids it in custom job ids)', () => {
    expect(evaluateJobId('w1', 1)).not.toContain(':');
    expect(scanJobId('w1', 1)).not.toContain(':');
  });
});

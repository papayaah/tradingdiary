import { describe, expect, it } from 'vitest';
import { cyrb53, executionSetChecksum } from './hash';

describe('cyrb53', () => {
  it('is deterministic', () => {
    expect(cyrb53('acc-1|AAPL|BUY')).toBe(cyrb53('acc-1|AAPL|BUY'));
  });

  it('separates different inputs', () => {
    expect(cyrb53('a')).not.toBe(cyrb53('b'));
  });
});

describe('executionSetChecksum', () => {
  it('is independent of order and duplicates', () => {
    const a = executionSetChecksum(['ex_1', 'ex_2', 'ex_3']);
    const b = executionSetChecksum(['ex_3', 'ex_2', 'ex_1', 'ex_1']);
    expect(a).toBe(b);
  });

  it('changes when the execution set changes', () => {
    const a = executionSetChecksum(['ex_1', 'ex_2']);
    const b = executionSetChecksum(['ex_1', 'ex_2', 'ex_3']);
    expect(a).not.toBe(b);
  });
});

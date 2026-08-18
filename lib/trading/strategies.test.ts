import { describe, expect, it } from 'vitest';
import {
  normalizeStrategyName,
  makeRule,
  rulesFromText,
  activeStrategies,
  adherenceSummary,
} from './strategies';
import type { StrategyRecord, RuleCheck } from '@/lib/db/schema';

const strat = (over: Partial<StrategyRecord>): StrategyRecord => ({
  id: 'strat_1',
  name: 'ORB',
  rules: [],
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

describe('normalizeStrategyName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeStrategyName('  Opening   Range  Breakout ')).toBe('Opening Range Breakout');
  });
});

describe('makeRule / rulesFromText', () => {
  it('assigns a stable, unique id per rule', () => {
    const a = makeRule('Wait for the retest');
    const b = makeRule('Wait for the retest');
    expect(a.text).toBe('Wait for the retest');
    expect(a.id).not.toBe(b.id); // distinct rules, even with identical text
  });

  it('parses non-empty lines into rules', () => {
    const rules = rulesFromText('Enter on break\n\n  Stop below range \nTarget 2R');
    expect(rules.map((r) => r.text)).toEqual(['Enter on break', 'Stop below range', 'Target 2R']);
  });
});

describe('activeStrategies', () => {
  it('excludes archived playbooks', () => {
    const list = [strat({ id: 'a' }), strat({ id: 'b', archivedAt: 123 })];
    expect(activeStrategies(list).map((s) => s.id)).toEqual(['a']);
  });
});

describe('adherenceSummary', () => {
  const rules = [
    { id: 'r1', text: 'a' },
    { id: 'r2', text: 'b' },
    { id: 'r3', text: 'c' },
    { id: 'r4', text: 'd' },
  ];

  it('counts each status and excludes N-A and unset from the rate', () => {
    const checks: RuleCheck[] = [
      { ruleId: 'r1', status: 'followed', source: 'trader' },
      { ruleId: 'r2', status: 'violated', source: 'trader' },
      { ruleId: 'r3', status: 'not-applicable', source: 'trader' },
      // r4 unset
    ];
    const s = adherenceSummary(rules, checks);
    expect(s).toMatchObject({ followed: 1, violated: 1, notApplicable: 1, unset: 1, total: 4 });
    expect(s.rate).toBeCloseTo(0.5); // 1 followed / (1 followed + 1 violated)
  });

  it('returns a null rate when nothing is gradeable', () => {
    const s = adherenceSummary(rules, [
      { ruleId: 'r1', status: 'not-applicable', source: 'trader' },
    ]);
    expect(s.rate).toBeNull();
  });

  it('ignores checks for rules not in the playbook', () => {
    const s = adherenceSummary([{ id: 'r1', text: 'a' }], [
      { ruleId: 'ghost', status: 'followed', source: 'trader' },
    ]);
    expect(s.followed).toBe(0);
    expect(s.unset).toBe(1);
  });
});

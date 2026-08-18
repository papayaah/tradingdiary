import type { StrategyRecord, StrategyRule, RuleCheck } from '../db/schema';

/** Stable random id (survives renames, unlike a name-derived id). */
export function newId(prefix: string): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  return `${prefix}_${uuid}`;
}

export function normalizeStrategyName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Build a rule object from free text, assigning it a stable id. */
export function makeRule(text: string): StrategyRule {
  return { id: newId('rule'), text: text.trim() };
}

/** Parse a multi-line textarea into rules (one non-empty line each). */
export function rulesFromText(text: string): StrategyRule[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => makeRule(line));
}

/** Non-archived playbooks, for new-link pickers. */
export function activeStrategies(strategies: StrategyRecord[]): StrategyRecord[] {
  return strategies.filter((s) => !s.archivedAt);
}

export interface AdherenceSummary {
  followed: number;
  violated: number;
  notApplicable: number;
  /** Rules with no recorded check yet. */
  unset: number;
  total: number;
  /** followed / (followed + violated); null when nothing is gradeable. */
  rate: number | null;
}

/**
 * Summarise a trade's adherence to a playbook's rules. Only followed/violated
 * count toward the rate; not-applicable and unset are excluded so a rate is an
 * honest pass ratio over the rules that actually applied.
 */
export function adherenceSummary(
  rules: StrategyRule[],
  checks: RuleCheck[],
): AdherenceSummary {
  const byRule = new Map(checks.map((c) => [c.ruleId, c.status]));
  let followed = 0;
  let violated = 0;
  let notApplicable = 0;
  let unset = 0;
  for (const rule of rules) {
    const status = byRule.get(rule.id);
    if (status === 'followed') followed++;
    else if (status === 'violated') violated++;
    else if (status === 'not-applicable') notApplicable++;
    else unset++;
  }
  const gradeable = followed + violated;
  return {
    followed,
    violated,
    notApplicable,
    unset,
    total: rules.length,
    rate: gradeable > 0 ? followed / gradeable : null,
  };
}

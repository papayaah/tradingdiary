'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Plus, X, Check, Ban, Minus } from 'lucide-react';
import type { StrategyRecord, RuleCheck, RuleAdherenceStatus } from '@/lib/db/schema';
import { getAllStrategies, createStrategy } from '@/lib/db/strategies';
import { getTradeNote, setTradePlaybook, type TradeRef } from '@/lib/db/notes';
import { activeStrategies, adherenceSummary, rulesFromText } from '@/lib/trading/strategies';

interface TradePlaybookEditorProps {
  tradeRef: TradeRef;
  onChange?: () => void;
}

const STATUS_OPTIONS: { status: RuleAdherenceStatus; label: string; icon: typeof Check; tint: string }[] = [
  { status: 'followed', label: 'Followed', icon: Check, tint: 'text-profit border-profit/40 bg-profit/10' },
  { status: 'violated', label: 'Violated', icon: Ban, tint: 'text-loss border-loss/40 bg-loss/10' },
  { status: 'not-applicable', label: 'N/A', icon: Minus, tint: 'text-muted border-card-border bg-muted-bg/40' },
];

/**
 * Link a primary playbook to a trade and record rule adherence. Creating a
 * playbook that doesn't exist adds it to the shared set. Embedded panel — no modal.
 */
export default function TradePlaybookEditor({ tradeRef, onChange }: TradePlaybookEditorProps) {
  const [strategies, setStrategies] = useState<StrategyRecord[]>([]);
  const [strategyId, setStrategyId] = useState<string | undefined>(undefined);
  const [checks, setChecks] = useState<RuleCheck[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRules, setNewRules] = useState('');
  const key = tradeRef.tradeGroupKey;

  useEffect(() => {
    let active = true;
    (async () => {
      const [list, note] = await Promise.all([getAllStrategies(), getTradeNote(key)]);
      if (!active) return;
      setStrategies(list);
      setStrategyId(note?.strategyId);
      setChecks(note?.ruleChecks ?? []);
    })();
    return () => {
      active = false;
    };
  }, [key]);

  const linked = useMemo(() => strategies.find((s) => s.id === strategyId), [strategies, strategyId]);
  const summary = useMemo(
    () => (linked ? adherenceSummary(linked.rules, checks) : null),
    [linked, checks],
  );

  const persist = async (nextId: string | undefined, nextChecks: RuleCheck[]) => {
    await setTradePlaybook(tradeRef, nextId, nextChecks);
    onChange?.();
  };

  const link = async (id: string) => {
    setStrategyId(id);
    setChecks([]);
    await persist(id, []);
  };

  const unlink = async () => {
    setStrategyId(undefined);
    setChecks([]);
    await persist(undefined, []);
  };

  const setRuleStatus = async (ruleId: string, status: RuleAdherenceStatus) => {
    const current = checks.find((c) => c.ruleId === ruleId);
    // Clicking the active status again clears it (back to unset).
    const next =
      current?.status === status
        ? checks.filter((c) => c.ruleId !== ruleId)
        : [...checks.filter((c) => c.ruleId !== ruleId), { ruleId, status, source: 'trader' as const }];
    setChecks(next);
    await persist(strategyId, next);
  };

  const createAndLink = async () => {
    const name = newName.trim();
    if (!name) return;
    const created = await createStrategy({ name, rules: rulesFromText(newRules) });
    setStrategies(await getAllStrategies());
    setCreating(false);
    setNewName('');
    setNewRules('');
    await link(created.id);
  };

  const options = activeStrategies(strategies);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted uppercase tracking-wider">
        <BookOpen size={12} />
        Playbook
        {summary && (
          <span className="text-muted/70 normal-case font-normal tracking-normal">
            · {summary.followed}/{summary.followed + summary.violated || 0} rules followed
            {summary.rate != null && ` (${Math.round(summary.rate * 100)}%)`}
          </span>
        )}
      </div>

      {!linked ? (
        <div className="space-y-2">
          {options.length > 0 && !creating && (
            <div className="flex flex-wrap gap-1.5">
              {options.map((s) => (
                <button
                  key={s.id}
                  onClick={() => link(s.id)}
                  className="px-2.5 py-1.5 rounded-lg border border-card-border bg-card-bg hover:border-accent/40 hover:bg-accent/10 text-xs font-medium text-foreground transition-all"
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}

          {creating ? (
            <div className="space-y-2 rounded-xl border border-card-border bg-muted-bg/30 p-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Playbook name (e.g. Opening Range Breakout)"
                className="w-full bg-card-bg border border-card-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted outline-none focus:border-accent"
              />
              <textarea
                value={newRules}
                onChange={(e) => setNewRules(e.target.value)}
                placeholder="One rule per line, e.g.&#10;Wait for the range to form&#10;Enter on break with volume&#10;Stop below the range"
                rows={4}
                className="w-full bg-card-bg border border-card-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted outline-none focus:border-accent resize-y"
              />
              <div className="flex gap-2">
                <button
                  onClick={createAndLink}
                  disabled={!newName.trim()}
                  className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold hover:bg-accent/90 transition-all disabled:opacity-50"
                >
                  Create &amp; link
                </button>
                <button
                  onClick={() => setCreating(false)}
                  className="px-3 py-1.5 border border-card-border rounded-lg text-xs font-semibold text-muted hover:text-foreground transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-card-border text-xs font-medium text-muted hover:text-foreground hover:border-accent/40 transition-all"
            >
              <Plus size={13} />
              New playbook
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-bold text-foreground truncate">{linked.name}</span>
              {linked.archivedAt && (
                <span className="text-[10px] text-muted uppercase tracking-wider">archived</span>
              )}
            </div>
            <button
              onClick={unlink}
              className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-loss transition-colors"
            >
              <X size={12} />
              Unlink
            </button>
          </div>

          {linked.thesis && <p className="text-[11px] text-muted leading-relaxed">{linked.thesis}</p>}

          {linked.rules.length === 0 ? (
            <p className="text-[11px] text-muted italic">This playbook has no rules yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {linked.rules.map((rule) => {
                const status = checks.find((c) => c.ruleId === rule.id)?.status;
                return (
                  <li
                    key={rule.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-card-border bg-muted-bg/30 px-3 py-2"
                  >
                    <span className="text-[11px] text-foreground min-w-0">{rule.text}</span>
                    <div className="flex gap-1 shrink-0">
                      {STATUS_OPTIONS.map((opt) => {
                        const Icon = opt.icon;
                        const on = status === opt.status;
                        return (
                          <button
                            key={opt.status}
                            title={opt.label}
                            onClick={() => setRuleStatus(rule.id, opt.status)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-semibold transition-all ${
                              on ? opt.tint : 'border-card-border text-muted hover:text-foreground'
                            }`}
                          >
                            <Icon size={11} />
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

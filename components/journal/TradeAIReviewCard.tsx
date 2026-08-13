'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sparkles, Copy, X, Save, AlertTriangle, Loader2, CircleHelp } from 'lucide-react';
import type { AggregatedTrade } from '@/lib/trading/aggregator';
import { formatCurrency } from '@/lib/currency';
import { useAIManagementContextOptional } from '@/packages/ai-connect/src/components';
import {
  buildTradeContext,
  requestTradeReview,
  type TradeReviewResult,
} from '@/lib/journal/request-trade-review';
import { hashTradeContext, type TradeAnalysisContext } from '@/lib/trading/trade-analysis';
import type { TradeAnalysis } from '@/lib/trading/trade-review-contract';
import {
  getTradeAIReviews,
  saveTradeAIReview,
  deleteTradeAIReview,
  tradeGroupId,
} from '@/lib/db/notes';
import type { TradeAIReviewRecord } from '@/lib/db/schema';

interface TradeAIReviewCardProps {
  trade: AggregatedTrade;
  accountId: string;
  currency: string;
}

function formatDuration(ms: number): string {
  if (!ms || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function confidenceBadge(c: 'low' | 'medium' | 'high') {
  const map = {
    low: 'bg-loss/10 text-loss border-loss/20',
    medium: 'bg-muted-bg text-muted border-card-border',
    high: 'bg-profit/10 text-profit border-profit/20',
  } as const;
  return map[c];
}

/** Deterministic Objective Trade Statistics — always shown (no AI key required). */
function StatsPanel({ ctx, currency }: { ctx: TradeAnalysisContext; currency: string }) {
  const { metrics, trade, executions, flags } = ctx;
  type MetricKey = 'holding' | 'executions' | 'pnl' | 'size' | 'mfe' | 'mae' | 'giveback' | 'peak';
  const [explainedMetric, setExplainedMetric] = useState<MetricKey | null>(null);
  const explanations: Record<MetricKey, { title: string; description: string; calculation: string }> = {
    holding: {
      title: 'Holding duration',
      description: 'How long the position remained open, from the first entry to the final exit.',
      calculation: formatDuration(metrics.holdingDurationMs),
    },
    executions: {
      title: 'Executions',
      description: 'The number of individual fills used to open, add to, reduce, or close this position.',
      calculation: `${executions.length} recorded fill${executions.length === 1 ? '' : 's'}`,
    },
    pnl: {
      title: 'Net profit and loss',
      description: 'The realized result of the trade after recorded commissions and fees.',
      calculation: formatCurrency(trade.netPnL, currency),
    },
    size: {
      title: 'Maximum size',
      description: 'The largest absolute position quantity held at any moment during the trade.',
      calculation: `${trade.maxPositionQuantity} shares or contracts`,
    },
    mfe: {
      title: 'Maximum Favorable Excursion (MFE)',
      description: 'The largest unrealized profit reached while the position was open.',
      calculation: `${formatCurrency(metrics.mfe.points, currency)} favorable move × ${trade.maxPositionQuantity} maximum size = ${formatCurrency(metrics.mfe.amount, currency)}`,
    },
    mae: {
      title: 'Maximum Adverse Excursion (MAE)',
      description: 'The largest unrealized loss reached while the position was open.',
      calculation: `${formatCurrency(metrics.mae.points, currency)} adverse move × ${trade.maxPositionQuantity} maximum size = ${formatCurrency(-metrics.mae.amount, currency)}`,
    },
    giveback: {
      title: 'Exit giveback',
      description: 'How much of the trade’s peak unrealized profit was no longer present at the final exit.',
      calculation: metrics.exitGivebackFromMFE
        ? `${formatCurrency(metrics.exitGivebackFromMFE.amount, currency)} · ${metrics.exitGivebackFromMFE.percentOfMFE.toFixed(1)}% of MFE`
        : 'Not available for this trade',
    },
    peak: {
      title: 'Time to peak',
      description: 'Elapsed time from the first entry until the trade reached its MFE.',
      calculation: metrics.timeToMfeMs != null ? formatDuration(metrics.timeToMfeMs) : 'Not available',
    },
  };
  const stat = (key: MetricKey, label: string, value: string) => (
    <button
      type="button"
      onClick={() => setExplainedMetric((current) => current === key ? null : key)}
      aria-expanded={explainedMetric === key}
      className="group flex flex-col rounded-md text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted/70 group-hover:text-accent">
        {label} <CircleHelp size={10} aria-hidden="true" />
      </span>
      <span className="text-sm font-semibold text-foreground tabular-nums">{value}</span>
    </button>
  );
  const explanation = explainedMetric ? explanations[explainedMetric] : null;
  return (
    <div className="rounded-lg border border-card-border bg-background/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Objective Trade Statistics
        </span>
        {!flags.hasCandles && (
          <span className="text-[10px] text-muted/70">
            {flags.isDemoTrade ? 'demo data — execution-only' : 'no market data — execution-only'}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stat('holding', 'Holding', formatDuration(metrics.holdingDurationMs))}
        {stat('executions', 'Executions', String(executions.length))}
        {stat('pnl', 'Net P&L', formatCurrency(trade.netPnL, currency))}
        {stat('size', 'Max Size', String(trade.maxPositionQuantity))}
        {stat(
          'mfe',
          'MFE',
          `${formatCurrency(metrics.mfe.amount, currency)} (${metrics.mfe.percent.toFixed(1)}%)`
        )}
        {stat(
          'mae',
          'MAE',
          `${formatCurrency(-metrics.mae.amount, currency)} (${metrics.mae.percent.toFixed(1)}%)`
        )}
        {metrics.exitGivebackFromMFE
          ? stat(
              'giveback',
              'Exit Giveback',
              `${formatCurrency(metrics.exitGivebackFromMFE.amount, currency)} (${metrics.exitGivebackFromMFE.percentOfMFE.toFixed(0)}% of MFE)`
            )
          : stat('giveback', 'Exit Giveback', '—')}
        {stat('peak', 'Time to Peak', metrics.timeToMfeMs != null ? formatDuration(metrics.timeToMfeMs) : '—')}
      </div>
      {explanation && (
        <div className="mt-3 rounded-lg border border-accent/20 bg-accent/5 p-3" role="note">
          <div className="text-xs font-semibold text-foreground">{explanation.title}</div>
          <p className="mt-1 text-xs leading-relaxed text-muted">{explanation.description}</p>
          <p className="mt-1.5 text-xs font-medium tabular-nums text-foreground">This trade: {explanation.calculation}</p>
        </div>
      )}
      {flags.marketDataPriceMismatch && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-loss">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          Market prices did not match the recorded fills, so MFE and MAE use execution-only estimates.
        </div>
      )}
      {flags.isDemoTrade && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-muted">
          Demo fills use a synthetic price path, so excursion statistics are estimated from executions rather than live provider candles.
        </div>
      )}
      {flags.multipleRoundTrips && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-loss">
          <AlertTriangle size={12} />
          Multiple round-trips in this symbol/day — excursion metrics are approximate.
        </div>
      )}
    </div>
  );
}

function humanizeMetricName(metric: string): string {
  const names: Record<string, string> = {
    mae: 'MAE',
    mfe: 'MFE',
    'metrics.mae': 'MAE',
    'metrics.mfe': 'MFE',
    'exitGivebackFromMFE.percentOfMFE': 'Exit giveback',
    'metrics.exitGivebackFromMFE.percentOfMFE': 'Exit giveback',
    holdingDurationMs: 'Holding duration',
    timeToMfeMs: 'Time to peak',
  };
  return names[metric] ?? metric
    .replace(/^metrics\./, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\./g, ' · ');
}

function humanizeReviewText(text: string): string {
  return text
    .replace(/([\d,]+(?:\.\d+)?)\s*ms\b/g, (_, raw: string) => formatDuration(Number(raw.replace(/,/g, ''))))
    .replace(/(?:metrics\.)?exitGivebackFromMFE\.percentOfMFE/g, 'exit giveback')
    .replace(/holdingDurationMs/g, 'holding duration')
    .replace(/timeToMfeMs/g, 'time to peak');
}

function humanizeEvidenceValue(metric: string, value: string): string {
  const numeric = Number(value.replace(/,/g, '').replace(/%$/, ''));
  if (/percentOfMFE/i.test(metric) && Number.isFinite(numeric)) return `${numeric.toFixed(1)}%`;
  if (/Ms$|Duration|timeTo/i.test(metric) && Number.isFinite(numeric)) return formatDuration(numeric);
  return humanizeReviewText(value);
}

function AnalysisView({ a }: { a: TradeAnalysis }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground leading-relaxed">{humanizeReviewText(a.summary)}</p>

      {a.observations.length > 0 && (
        <div className="space-y-2">
          {a.observations.map((o, i) => (
            <div key={i} className="rounded-lg border border-card-border bg-background/40 p-2.5">
              <div className="text-xs font-semibold text-foreground">{o.label}</div>
              <div className="text-xs text-muted mt-0.5 leading-relaxed">{humanizeReviewText(o.detail)}</div>
              {o.evidence && o.evidence.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {o.evidence.map((e, j) => (
                    <span
                      key={j}
                      className="inline-flex items-center gap-1 rounded bg-muted-bg px-1.5 py-0.5 text-[10px] text-muted"
                    >
                      <span className="font-medium text-foreground">{humanizeMetricName(e.metric)}</span>
                      {humanizeEvidenceValue(e.metric, e.value)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {a.executionReview && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted/70 mb-0.5">Execution</div>
          <p className="text-xs text-muted leading-relaxed">{humanizeReviewText(a.executionReview)}</p>
        </div>
      )}
      {a.riskReview && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted/70 mb-0.5">Risk</div>
          <p className="text-xs text-muted leading-relaxed">{humanizeReviewText(a.riskReview)}</p>
        </div>
      )}
      {a.questionsForTrader && a.questionsForTrader.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted/70 mb-0.5">
            Questions for you
          </div>
          <ul className="list-disc list-inside space-y-0.5">
            {a.questionsForTrader.map((q, i) => (
              <li key={i} className="text-xs text-muted leading-relaxed">
                {humanizeReviewText(q)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.takeaway && (
        <div className="rounded-lg bg-accent/5 border border-accent/20 p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-accent mb-0.5">Takeaway</div>
          <p className="text-xs text-foreground leading-relaxed">{humanizeReviewText(a.takeaway)}</p>
        </div>
      )}
    </div>
  );
}

function analysisToText(a: TradeAnalysis): string {
  const lines = [humanizeReviewText(a.summary), ''];
  for (const o of a.observations) lines.push(`• ${o.label}: ${humanizeReviewText(o.detail)}`);
  if (a.executionReview) lines.push('', `Execution: ${humanizeReviewText(a.executionReview)}`);
  if (a.riskReview) lines.push('', `Risk: ${humanizeReviewText(a.riskReview)}`);
  if (a.questionsForTrader?.length) {
    lines.push('', 'Questions:');
    a.questionsForTrader.forEach((q) => lines.push(`- ${humanizeReviewText(q)}`));
  }
  if (a.takeaway) lines.push('', `Takeaway: ${humanizeReviewText(a.takeaway)}`);
  return lines.join('\n');
}

export default function TradeAIReviewCard({ trade, accountId, currency }: TradeAIReviewCardProps) {
  const aiContext = useAIManagementContextOptional();
  const [ctx, setCtx] = useState<TradeAnalysisContext | null>(null);
  const [result, setResult] = useState<TradeReviewResult | null>(null);
  const [saved, setSaved] = useState<TradeAIReviewRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const cfg = aiContext?.config;
  const apiKey = cfg?.customLLM?.apiKey;
  const provider = cfg?.customLLM?.provider;
  const model = cfg?.customLLM?.model;
  const hasAI = Boolean(apiKey) || cfg?.type === 'hosted-api';

  // Build deterministic context (for the fallback stats panel + staleness checks)
  useEffect(() => {
    let cancelled = false;
    setCtx(null);
    buildTradeContext(trade).then((c) => {
      if (!cancelled) setCtx(c);
    });
    return () => {
      cancelled = true;
    };
  }, [trade]);

  // Load persisted reviews for this trade group
  useEffect(() => {
    getTradeAIReviews(trade.date, trade.symbol, accountId).then(setSaved);
  }, [trade.date, trade.symbol, accountId]);

  const currentHash = ctx ? hashTradeContext(ctx) : '';
  const freshExists = saved.some((r) => r.contextHash === currentHash);

  const handleAsk = useCallback(async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const r = await requestTradeReview(trade, { apiKey, provider, model });
      setResult(r);
      if (provider && model && aiContext?.recordUsage && r.usage) {
        aiContext.recordUsage(provider, model, {
          inputTokens: r.usage.promptTokens,
          outputTokens: r.usage.completionTokens,
          totalTokens: r.usage.totalTokens,
        });
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Review failed');
    } finally {
      setLoading(false);
    }
  }, [trade, apiKey, provider, model, aiContext]);

  const handleSave = useCallback(async () => {
    if (!result) return;
    const record: TradeAIReviewRecord = {
      id: `rev_${trade.date}_${trade.symbol}_${saved.length}_${currentHash}`,
      date: trade.date,
      symbol: trade.symbol,
      accountId,
      tradeGroupId: tradeGroupId(trade.date, trade.symbol, accountId),
      summary: result.analysis.summary,
      observations: result.analysis.observations,
      executionReview: result.analysis.executionReview,
      riskReview: result.analysis.riskReview,
      questionsForTrader: result.analysis.questionsForTrader,
      takeaway: result.analysis.takeaway,
      evidenceConfidence: result.analysis.evidenceConfidence,
      provider: result.provider,
      model: result.model,
      promptVersion: result.promptVersion,
      contextHash: result.contextHash,
      createdAt: Date.now(),
    };
    await saveTradeAIReview(record);
    setSaved(await getTradeAIReviews(trade.date, trade.symbol, accountId));
    setResult(null);
  }, [result, trade, accountId, saved.length, currentHash]);

  const handleCopy = useCallback(() => {
    if (!result) return;
    navigator.clipboard.writeText(analysisToText(result.analysis));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [result]);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteTradeAIReview(id);
      setSaved(await getTradeAIReviews(trade.date, trade.symbol, accountId));
    },
    [trade.date, trade.symbol, accountId]
  );

  return (
    <div className="space-y-3">
      {ctx ? <StatsPanel ctx={ctx} currency={currency} /> : (
        <div className="text-xs text-muted/60 italic py-2">Computing trade statistics…</div>
      )}

      {/* Ask AI */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleAsk}
          disabled={loading || !hasAI || !ctx}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent/10 border border-accent/30 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {loading ? 'Reviewing…' : 'Ask AI Assistant'}
        </button>
        {!hasAI && (
          <span className="text-[11px] text-muted/70">Add an AI key in Settings to enable review.</span>
        )}
        {hasAI && freshExists && !result && (
          <span className="text-[11px] text-muted/70">
            A current review already exists below.
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-loss/30 bg-loss/5 px-3 py-2 text-xs text-loss">
          {error}
        </div>
      )}

      {/* New (unsaved) review */}
      {result && (
        <div className="rounded-xl border border-accent/30 bg-card-bg/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <span
              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${confidenceBadge(result.analysis.evidenceConfidence)}`}
            >
              {result.analysis.evidenceConfidence} confidence
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleSave}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted-bg"
              >
                <Save size={12} /> Save
              </button>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted hover:bg-muted-bg"
              >
                <Copy size={12} /> {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={() => setResult(null)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted hover:bg-muted-bg"
              >
                <X size={12} /> Dismiss
              </button>
            </div>
          </div>
          <AnalysisView a={result.analysis} />
          <div className="mt-2 text-[10px] text-muted/50">
            {result.provider} · {result.model}
          </div>
        </div>
      )}

      {/* Saved reviews */}
      {saved.map((r) => {
        const stale = currentHash !== '' && r.contextHash !== currentHash;
        return (
          <div key={r.id} className="rounded-xl border border-card-border bg-card-bg/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${confidenceBadge(r.evidenceConfidence)}`}
                >
                  {r.evidenceConfidence}
                </span>
                {stale && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-loss">
                    <AlertTriangle size={11} /> stale
                  </span>
                )}
                <span className="text-[10px] text-muted/50">
                  {new Date(r.createdAt).toLocaleString()}
                </span>
              </div>
              <button
                onClick={() => handleDelete(r.id)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted hover:bg-muted-bg"
              >
                <X size={12} /> Delete
              </button>
            </div>
            <AnalysisView
              a={{
                summary: r.summary,
                observations: r.observations,
                executionReview: r.executionReview,
                riskReview: r.riskReview,
                questionsForTrader: r.questionsForTrader,
                takeaway: r.takeaway,
                evidenceConfidence: r.evidenceConfidence,
              }}
            />
            <div className="mt-2 text-[10px] text-muted/50">
              {r.provider} · {r.model}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { z } from 'zod';
import type { TradeAnalysisContext } from './trade-analysis';
import { formatEtTimestamp12Hour, normalizeReviewTextValues } from './review-time';

/** Bump when the prompt template or schema meaningfully changes. */
export const TRADE_REVIEW_PROMPT_VERSION = '5';

// ============================================================================
// AI output contract (see docs/specs/trade-ai-assistant-notes.md §4)
// ============================================================================

export const observationEvidenceSchema = z.object({
  metric: z.string(),
  value: z.string(),
  source: z.enum(['METRIC', 'EVENT', 'STRATEGY_RULE']).optional(),
});

export const tradeAnalysisSchema = z.object({
  summary: z.string(),
  observations: z
    .array(
      z.object({
        label: z.string(),
        detail: z.string(),
        evidence: z.array(observationEvidenceSchema).optional(),
      })
    )
    .default([]),
  executionReview: z.string().optional(),
  riskReview: z.string().optional(),
  questionsForTrader: z.array(z.string()).optional(),
  takeaway: z.string().optional(),
  evidenceConfidence: z.enum(['low', 'medium', 'high']),
});

export type TradeAnalysis = z.infer<typeof tradeAnalysisSchema>;

// ============================================================================
// Prompt construction
// ============================================================================

export const TRADE_REVIEW_SYSTEM_PROMPT = `You are an evidence-first trading execution reviewer. You evaluate objective trade
execution data. You do NOT give generic or judgmental advice.

Rules (in priority order):
1. State facts: report exact execution data and objective metrics you are given.
2. Identify notable behavior (scale-in clustering, giveback, duration) WITHOUT moral judgment.
3. Compare execution against the trader's explicit rules or pre-trade plan ONLY when supplied.
4. Ask questions when intent is unknown — whether actions were planned or reactive.
5. Do NOT infer profit = good trade or loss = bad trade. Quality = plan adherence and risk control.
6. Do NOT infer intent from execution alone. Describe observable actions; classify as planned/reactive/
   disciplined/undisciplined ONLY when trader rules or pre-trade intent provide evidence.
7. Clearly distinguish prices from timestamps. Format prices using the supplied trade currency. Use the
   "ET" timezone suffix only after an actual clock time, never after a price.

evidenceConfidence reflects DATA COMPLETENESS, not your opinion strength. You may LOWER the provided
ceiling but never raise it. If multipleRoundTrips is true, the excursion metrics span more than one
round-trip and are approximate — say so.

Return ONLY raw JSON matching the requested schema. No markdown, no code fences.`;

function displayDuration(ms?: number): string | undefined {
  if (ms == null || ms < 0) return undefined;
  const seconds = Math.round(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainder}s`;
  return `${remainder}s`;
}

function buildDisplayContext(ctx: TradeAnalysisContext) {
  return {
    trade: {
      ...ctx.trade,
      openedAt: formatEtTimestamp12Hour(ctx.trade.openedAt),
      closedAt: formatEtTimestamp12Hour(ctx.trade.closedAt),
    },
    executions: ctx.executions.map((execution) => ({
      ...execution,
      timestamp: formatEtTimestamp12Hour(execution.timestamp),
    })),
    risk: ctx.risk,
    marketContext: ctx.marketContext,
    metrics: {
      MFE: ctx.metrics.mfe,
      MAE: ctx.metrics.mae,
      rMultiple: ctx.metrics.rMultiple,
      exitGivebackFromMFE: ctx.metrics.exitGivebackFromMFE,
      timeToPeak: displayDuration(ctx.metrics.timeToMfeMs),
      holdingDuration: displayDuration(ctx.metrics.holdingDurationMs),
    },
    events: ctx.events.map((event) => ({
      ...event,
      timestamp: formatEtTimestamp12Hour(event.timestamp),
    })),
    flags: ctx.flags,
    evidenceConfidence: ctx.evidenceConfidence,
  };
}

export function buildTradeReviewPrompt(ctx: TradeAnalysisContext): string {
  return `Review this trade using ONLY the deterministic data below.

DATA:
${JSON.stringify(buildDisplayContext(ctx), null, 2)}

Return a JSON object with this exact shape:
{
  "summary": string,                       // 1-2 factual sentences
  "observations": [                        // objective, evidence-backed
    { "label": string, "detail": string,
      "evidence": [{ "metric": string, "value": string, "source": "METRIC"|"EVENT"|"STRATEGY_RULE" }] }
  ],
  "executionReview": string,               // optional
  "riskReview": string,                    // optional
  "questionsForTrader": [string],          // optional; ask when intent is unknown
  "takeaway": string,                      // optional; neutral, plan-focused
  "evidenceConfidence": "low"|"medium"|"high"  // <= ${ctx.evidenceConfidence}
}

Ground every observation in a metric or event from the data. Do not invent prices, times, or levels.
Use human-readable durations (for example, "45m"), never milliseconds. Use friendly metric names,
never internal property paths. Use readable dates and minute-precision 12-hour clock timestamps with
AM/PM (for example, "Aug 20, 2026 at 1:58 PM ET"), never ISO dates, seconds, 24-hour, or military time.
Clearly label prices using the supplied currency;
never append "ET" to a price. Round displayed percentages to at most one decimal place.`;
}

function normalizeAnalysisValues(analysis: TradeAnalysis, currency: string): TradeAnalysis {
  const normalize = (text: string) => normalizeReviewTextValues(text, currency);
  const normalizeOptional = (text?: string) => text ? normalize(text) : text;
  return {
    ...analysis,
    summary: normalize(analysis.summary),
    observations: analysis.observations.map((observation) => ({
      ...observation,
      detail: normalize(observation.detail),
      evidence: observation.evidence?.map((evidence) => ({
        ...evidence,
        value: normalize(evidence.value),
      })),
    })),
    executionReview: normalizeOptional(analysis.executionReview),
    riskReview: normalizeOptional(analysis.riskReview),
    questionsForTrader: analysis.questionsForTrader?.map(normalize),
    takeaway: normalizeOptional(analysis.takeaway),
  };
}

/**
 * Parse+validate a raw model string into TradeAnalysis. Tolerates accidental code
 * fences. Returns null on failure so the caller can fall back or repair.
 */
export function parseTradeAnalysis(raw: string, currency = 'USD'): TradeAnalysis | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    const json = JSON.parse(cleaned);
    const result = tradeAnalysisSchema.safeParse(json);
    return result.success ? normalizeAnalysisValues(result.data, currency) : null;
  } catch {
    return null;
  }
}

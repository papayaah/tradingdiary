import type { AggregatedTrade } from '@/lib/trading/aggregator';
import { fetchCandles } from '@/lib/chart/fetch';
import {
  buildTradeAnalysisContext,
  hashTradeContext,
  type TradeAnalysisContext,
} from '@/lib/trading/trade-analysis';
import type { TradeAnalysis } from '@/lib/trading/trade-review-contract';

export interface TradeReviewAIConfig {
  apiKey?: string;
  provider?: string;
  model?: string;
}

export interface TradeReviewResult {
  analysis: TradeAnalysis;
  context: TradeAnalysisContext;
  contextHash: string;
  provider: string;
  model: string;
  promptVersion: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

/**
 * Build the deterministic context for a trade (used for the fallback stats panel,
 * even without an AI key). Fetches candles via the shared market-data cache.
 */
export async function buildTradeContext(
  trade: AggregatedTrade,
  interval = '5m'
): Promise<TradeAnalysisContext> {
  const isDemoTrade = trade.transactions.length > 0
    && trade.transactions.every((transaction) => transaction.accountId === 'U99887766');
  let candles: Awaited<ReturnType<typeof fetchCandles>> = [];
  if (!isDemoTrade) {
    try {
      candles = await fetchCandles(trade.symbol, trade.date, interval);
    } catch {
      candles = [];
    }
  }
  return buildTradeAnalysisContext(trade, candles, { interval, isDemoTrade });
}

/** Run a full AI review: build context, call the server route, return validated analysis. */
export async function requestTradeReview(
  trade: AggregatedTrade,
  config: TradeReviewAIConfig,
  interval = '5m'
): Promise<TradeReviewResult> {
  const context = await buildTradeContext(trade, interval);

  const res = await fetch('/api/ai/trade-review', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey && { 'x-api-key': config.apiKey }),
      ...(config.provider && { 'x-provider': config.provider }),
      ...(config.model && { 'x-model': config.model }),
    },
    body: JSON.stringify({ context }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body?.error || `Trade review failed: ${res.status}`) as Error & {
      fallback?: boolean;
    };
    err.fallback = Boolean(body?.fallback);
    throw err;
  }

  const data = await res.json();
  return {
    analysis: data.analysis,
    context,
    contextHash: hashTradeContext(context),
    provider: data.provider,
    model: data.model,
    promptVersion: data.promptVersion,
    usage: data.usage,
  };
}

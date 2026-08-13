import { NextRequest, NextResponse } from 'next/server';
import { createVercelAIModel } from '@/packages/ai-connect/src/services/aiService';
import { generateText } from 'ai';
import {
  TRADE_REVIEW_SYSTEM_PROMPT,
  buildTradeReviewPrompt,
  parseTradeAnalysis,
  TRADE_REVIEW_PROMPT_VERSION,
} from '@/lib/trading/trade-review-contract';
import type { TradeAnalysisContext } from '@/lib/trading/trade-analysis';
import type { LLMProvider } from '@/packages/ai-connect/src/types';
import {
  attachGuestAICookie,
  creditExhaustedBody,
  creditUsageDetails,
  hostedAIConfig,
  reserveHostedAICredit,
  type HostedAICreditGate,
} from '@/lib/ai/hosted-credits';

// Reads headers, so must be dynamic.
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let creditGate: HostedAICreditGate | undefined;
  try {
    const config = hostedAIConfig(request);
    const { apiKey, provider, model: modelId } = config;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'No API key configured. Please add one in Settings.' },
        { status: 401 }
      );
    }

    const { context } = (await request.json()) as { context?: TradeAnalysisContext };
    if (!context || !context.trade) {
      return NextResponse.json({ error: 'Missing trade context' }, { status: 400 });
    }
    if (JSON.stringify(context).length > 250_000) {
      return NextResponse.json({ error: 'Trade context is too large' }, { status: 413 });
    }

    if (config.hosted) {
      creditGate = await reserveHostedAICredit(request, 'trade-review');
      if (!creditGate.reservation.allowed) {
        return attachGuestAICookie(
          NextResponse.json(creditExhaustedBody(creditGate), { status: 429 }),
          creditGate,
        );
      }
    }

    const model = await createVercelAIModel({
      provider: provider as LLMProvider,
      model: modelId,
      apiKey,
    });

    const prompt = buildTradeReviewPrompt(context);

    // First attempt
    const first = await generateText({
      model,
      system: TRADE_REVIEW_SYSTEM_PROMPT,
      prompt,
      maxTokens: 1200,
    });

    let analysis = parseTradeAnalysis(first.text);
    let usage = first.usage;

    // One repair retry on invalid JSON
    if (!analysis) {
      const repair = await generateText({
        model,
        system: TRADE_REVIEW_SYSTEM_PROMPT,
        prompt: `${prompt}

Your previous response could not be parsed as valid JSON matching the schema.
Return ONLY the corrected raw JSON object. No prose, no code fences.

Previous response:
${first.text}`,
        maxTokens: 1200,
      });
      analysis = parseTradeAnalysis(repair.text);
      usage = {
        promptTokens: (first.usage?.promptTokens ?? 0) + (repair.usage?.promptTokens ?? 0),
        completionTokens: (first.usage?.completionTokens ?? 0) + (repair.usage?.completionTokens ?? 0),
        totalTokens: (first.usage?.totalTokens ?? 0) + (repair.usage?.totalTokens ?? 0),
      } as typeof first.usage;
    }

    if (!analysis) {
      await creditGate?.reservation.release(
        'AI response could not be validated',
        creditUsageDetails(provider, modelId, usage),
      );
      // Client falls back to the deterministic Objective Trade Statistics panel.
      return attachGuestAICookie(NextResponse.json(
        { error: 'AI response could not be validated', fallback: true },
        { status: 422 }
      ), creditGate);
    }

    // Never let the model raise the deterministic confidence ceiling.
    const ceilingRank = { low: 0, medium: 1, high: 2 } as const;
    if (ceilingRank[analysis.evidenceConfidence] > ceilingRank[context.evidenceConfidence]) {
      analysis.evidenceConfidence = context.evidenceConfidence;
    }

    await creditGate?.reservation.complete(creditUsageDetails(provider, modelId, usage));
    return attachGuestAICookie(NextResponse.json({
      analysis,
      provider,
      model: modelId,
      promptVersion: TRADE_REVIEW_PROMPT_VERSION,
      usage: usage
        ? {
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
          }
        : undefined,
      credits: creditGate ? { remaining: creditGate.reservation.remaining } : undefined,
    }), creditGate);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Trade review failed';
    await creditGate?.reservation.release(message).catch(() => {});
    console.error('[Trade Review API Error]:', error);
    if (message.includes('401') || message.includes('Unauthorized') || message.includes('invalid')) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

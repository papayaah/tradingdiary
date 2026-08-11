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

// Reads headers, so must be dynamic.
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key') || process.env.OPENROUTER_API_KEY;
    const provider = request.headers.get('x-provider') || 'openrouter';
    const modelId =
      request.headers.get('x-model') ||
      (provider === 'openrouter' ? 'google/gemini-2.0-flash:free' : 'gemini-2.5-flash');

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

    const model = await createVercelAIModel({
      provider: provider as any,
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
      // Client falls back to the deterministic Objective Trade Statistics panel.
      return NextResponse.json(
        { error: 'AI response could not be validated', fallback: true },
        { status: 422 }
      );
    }

    // Never let the model raise the deterministic confidence ceiling.
    const ceilingRank = { low: 0, medium: 1, high: 2 } as const;
    if (ceilingRank[analysis.evidenceConfidence] > ceilingRank[context.evidenceConfidence]) {
      analysis.evidenceConfidence = context.evidenceConfidence;
    }

    return NextResponse.json({
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
    });
  } catch (error: any) {
    console.error('[Trade Review API Error]:', error);
    const message = error?.message || 'Trade review failed';
    if (message.includes('401') || message.includes('Unauthorized') || message.includes('invalid')) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

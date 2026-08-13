import { NextRequest, NextResponse } from 'next/server';
import { createVercelAIModel } from '@/packages/ai-connect/src/services/aiService';
import { generateText } from 'ai';
import type { LLMProvider } from '@/packages/ai-connect/src/types';
import {
    attachGuestAICookie,
    creditExhaustedBody,
    creditUsageDetails,
    hostedAIConfig,
    reserveHostedAICredit,
    type HostedAICreditGate,
} from '@/lib/ai/hosted-credits';

// Mark route as dynamic because it reads headers
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

        const { headers, sampleRows } = await request.json();

        if (!headers || !Array.isArray(headers) || headers.length === 0) {
            return NextResponse.json({ error: 'Invalid headers' }, { status: 400 });
        }
        if (!Array.isArray(sampleRows) || JSON.stringify({ headers, sampleRows }).length > 100_000) {
            return NextResponse.json({ error: 'Column mapping sample is too large' }, { status: 413 });
        }

        if (config.hosted) {
            creditGate = await reserveHostedAICredit(request, 'map-columns');
            if (!creditGate.reservation.allowed) {
                return attachGuestAICookie(
                    NextResponse.json(creditExhaustedBody(creditGate), { status: 429 }),
                    creditGate,
                );
            }
        }

        // Use the user's configured provider and model
        const model = await createVercelAIModel({
            provider: provider as LLMProvider,
            model: modelId || 'gemini-2.5-flash',
            apiKey,
        });

        const result = await generateText({
            model,
            system: 'You map CSV columns to a trading journal schema. Return JSON only.',
            prompt: `Map these CSV columns to our schema fields.

Schema fields:
- symbol (required)
- quantity (required unless realizedPnL is present)
- price (required unless realizedPnL is present)
- realizedPnL (optional, captures realized profit/loss)
- date (optional, defaults to today)
- time (optional)
- side (optional, defaults to BUY)
- companyName (optional, often called "Description")
- totalValue, commission, currency, orderId, orderType, stockCode (optional)

CSV headers: ${JSON.stringify(headers)}
Sample rows: ${JSON.stringify(sampleRows.slice(0, 3))}

Return a strictly valid JSON object with this structure:
{ 
  "mapping": { "<schema_field>": "<csv_header_name>", ... }, 
  "sideValues": { "<csv_side_value>": "BUY"|"SELL", ... } 
}

Example sideValues: { "买入": "BUY", "卖出": "SELL", "Long": "BUY", "Short": "SELL" }
Only map fields where you are confident. Return raw JSON without markdown formatting.`,
            temperature: 0,
            maxTokens: 800,
        });

        // Clean up potential markdown code blocks if the model behaves poorly
        let text = result.text.trim();
        if (text.startsWith('```json')) text = text.slice(7);
        if (text.startsWith('```')) text = text.slice(3);
        if (text.endsWith('```')) text = text.slice(0, -3);

        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(text) as Record<string, unknown>;
        } catch (error) {
            await creditGate?.reservation.release(
                'AI response was not valid JSON',
                creditUsageDetails(provider, modelId, result.usage),
            );
            throw error;
        }
        await creditGate?.reservation.complete(creditUsageDetails(provider, modelId, result.usage));
        return attachGuestAICookie(NextResponse.json({
            ...parsed,
            usage: {
                promptTokens: result.usage.promptTokens,
                completionTokens: result.usage.completionTokens,
                totalTokens: result.usage.totalTokens
            },
            credits: creditGate ? { remaining: creditGate.reservation.remaining } : undefined,
        }), creditGate);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to map columns';
        await creditGate?.reservation.release(message).catch(() => {});
        console.error('LLM Mapping error:', error);
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}

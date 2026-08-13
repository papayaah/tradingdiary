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

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    let creditGate: HostedAICreditGate | undefined;
    try {
        const config = hostedAIConfig(request);
        const { apiKey, provider, model: modelId } = config;

        if (!apiKey) {
            return NextResponse.json(
                { error: 'No API key configured. Please add one in Settings to use Image Import.' },
                { status: 401 }
            );
        }

        const { image } = await request.json();

        if (!image) {
            return NextResponse.json({ error: 'No image data provided' }, { status: 400 });
        }
        if (typeof image !== 'string' || image.length > 10_000_000) {
            return NextResponse.json({ error: 'Image is too large' }, { status: 413 });
        }

        if (config.hosted) {
            creditGate = await reserveHostedAICredit(request, 'extract-image');
            if (!creditGate.reservation.allowed) {
                return attachGuestAICookie(
                    NextResponse.json(creditExhaustedBody(creditGate), { status: 429 }),
                    creditGate,
                );
            }
        }

        // Use the user's configured provider and model
        console.log(`[AI-Extract] Starting extraction using provider: ${provider}, model: ${modelId || 'gemini-2.0-flash'}`);

        const model = await createVercelAIModel({
            provider: provider as LLMProvider,
            model: modelId || 'gemini-2.0-flash',
            apiKey,
        });

        const result = await generateText({
            model,
            messages: [{
                role: 'user',
                content: [
                    { type: 'image', image },
                    {
                        type: 'text', text: `Extract trade data from this screenshot into a structured JSON format.
          
Rules:
1. Only include executed trades. Skip cancelled, rejected, or working orders.
2. Extract all visible columns as headers.
3. Return a strictly valid JSON object with the following structure:
{
  "headers": ["Date", "Symbol", ...],
  "rows": [
    { "Date": "2023-01-01", "Symbol": "AAPL", ... },
    ...
  ]
}
4. Ensure all rows have the same keys as the headers.
5. Standardize dates to YYYY-MM-DD. If year is missing, use current year (2026).
6. Standardize times to HH:mm:ss. If seconds are missing, use :00.
7. Do not include markdown formatting (backticks). just raw JSON.
` }
                ],
            }],
            temperature: 0,
            maxTokens: 4000,
        });

        console.log(`[AI-Extract] Received response from AI. Length: ${result.text.length} chars.`);


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
        const message = error instanceof Error ? error.message : 'Failed to extract data from image';
        await creditGate?.reservation.release(message).catch(() => {});
        console.error('Image Extraction error:', error);
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}

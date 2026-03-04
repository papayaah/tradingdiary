import { NextRequest, NextResponse } from 'next/server';
import { createVercelAIModel } from '@/packages/ai-connect/src/services/aiService';
import { generateText } from 'ai';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        hasServerKey: !!process.env.OPENROUTER_API_KEY,
        provider: 'openrouter',
        model: 'google/gemini-2.0-flash:free',
    });
}

export async function POST(request: NextRequest) {
    try {
        const apiKey = request.headers.get('x-api-key');
        const provider = request.headers.get('x-provider') || 'openrouter';
        const requestedModel = request.headers.get('x-model');

        if (!apiKey) {
            return NextResponse.json({ error: 'No API key provided' }, { status: 400 });
        }

        // Default test models if none requested
        const defaultTestModels: Record<string, string> = {
            openrouter: 'google/gemini-2.0-flash:free',
            google: 'gemini-1.5-flash',
            openai: 'gpt-4o-mini',
            anthropic: 'claude-3-haiku-20240307',
        };

        const modelId = requestedModel || defaultTestModels[provider] || 'gemini-1.5-flash';

        console.log(`[AI Status] Starting validation for ${provider} / ${modelId}...`);

        const model = await createVercelAIModel({
            provider: provider as any,
            model: modelId,
            apiKey,
        });

        console.log(`[AI Status] Model created. Sending "ok" prompt...`);

        // Send a minimal request to verify the key works
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 second timeout

        try {
            const result = await generateText({
                model,
                prompt: 'Say "ok"',
                maxTokens: 5,
                abortSignal: controller.signal,
            });

            console.log(`[AI Status] Success! Received: "${result.text?.trim()}"`);

            return NextResponse.json({
                valid: true,
                response: result.text?.trim(),
                usage: {
                    promptTokens: result.usage.promptTokens,
                    completionTokens: result.usage.completionTokens,
                    totalTokens: result.usage.totalTokens
                }
            });
        } finally {
            clearTimeout(timeoutId);
        }
    } catch (error: any) {
        console.error('API key validation error:', error);
        const message = error.message || 'Validation failed';
        // Extract a user-friendly message
        if (message.includes('401') || message.includes('Unauthorized') || message.includes('invalid')) {
            return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
        }
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from 'next/server';
import { createVercelAIModel } from '@/packages/ai-connect/src/services/aiService';
import { generateText } from 'ai';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const apiKey = request.headers.get('x-api-key') || process.env.OPENROUTER_API_KEY;
        const provider = request.headers.get('x-provider') || 'openrouter';
        const modelId = request.headers.get('x-model') || (provider === 'openrouter' ? 'google/gemini-2.0-flash:free' : undefined);

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

        // Use the user's configured provider and model
        const model = await createVercelAIModel({
            provider: provider as any,
            model: modelId || 'gemini-2.5-flash',
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
        });

        let text = result.text.trim();
        if (text.startsWith('```json')) text = text.slice(7);
        if (text.startsWith('```')) text = text.slice(3);
        if (text.endsWith('```')) text = text.slice(0, -3);

        const parsed = JSON.parse(text);
        return NextResponse.json({
            ...parsed,
            usage: {
                promptTokens: result.usage.promptTokens,
                completionTokens: result.usage.completionTokens,
                totalTokens: result.usage.totalTokens
            }
        });

    } catch (error: any) {
        console.error('Image Extraction error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to extract data from image' },
            { status: 500 }
        );
    }
}

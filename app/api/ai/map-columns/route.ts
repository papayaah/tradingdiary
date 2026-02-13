import { NextRequest, NextResponse } from 'next/server';
import { createVercelAIModel } from '@/packages/ai-connect/src/services/aiService';
import { generateText } from 'ai';

// Mark route as dynamic because it reads headers
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const apiKey = request.headers.get('x-api-key') || process.env.OPENROUTER_API_KEY;

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

        // Using OpenRouter (free model)
        const model = await createVercelAIModel({
            provider: 'openrouter',
            model: 'google/gemini-2.0-flash-exp:free',
            apiKey,
        });

        const result = await generateText({
            model,
            system: 'You map CSV columns to a trading journal schema. Return JSON only.',
            prompt: `Map these CSV columns to our schema fields.

Schema fields (required): symbol, side, date, quantity, price
Schema fields (optional): time, orderId, companyName, currency, orderType, commission, totalValue, stockCode

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
        });

        // Clean up potential markdown code blocks if the model behaves poorly
        let text = result.text.trim();
        if (text.startsWith('```json')) text = text.slice(7);
        if (text.startsWith('```')) text = text.slice(3);
        if (text.endsWith('```')) text = text.slice(0, -3);

        const parsed = JSON.parse(text);
        return NextResponse.json(parsed);
    } catch (error: any) {
        console.error('LLM Mapping error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to map columns' },
            { status: 500 }
        );
    }
}

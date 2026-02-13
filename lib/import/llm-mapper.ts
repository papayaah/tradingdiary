import { ExtractedData, ColumnMapping, SideValueMapping } from './types';

export async function mapColumnsWithLLM(
    headers: string[],
    sampleRows: Record<string, string>[],
    apiKey?: string
): Promise<{ mapping: ColumnMapping; sideValues: SideValueMapping }> {
    // If no API key provided, we can't enhance mapping with LLM
    // Consumer should fallback to alias mapping
    if (!apiKey) {
        throw new Error('No API key provided for LLM mapping');
    }

    const res = await fetch('/api/ai/map-columns', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
        },
        body: JSON.stringify({ headers, sampleRows }),
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`LLM mapping failed: ${errorText}`);
    }

    return res.json();
}

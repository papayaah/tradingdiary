import { ColumnMapping, SideValueMapping } from './types';

interface LLMConfig {
    apiKey: string;
    provider?: string;
    model?: string;
}

export async function mapColumnsWithLLM(
    headers: string[],
    sampleRows: Record<string, string>[],
    config: LLMConfig | string
): Promise<{
    mapping: ColumnMapping;
    sideValues: SideValueMapping;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}> {
    // Support passing just an apiKey string for backwards compat
    const { apiKey, provider, model } = typeof config === 'string'
        ? { apiKey: config, provider: undefined, model: undefined }
        : config;

    if (!apiKey) {
        throw new Error('No API key provided for LLM mapping');
    }

    const res = await fetch('/api/ai/map-columns', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            ...(provider && { 'x-provider': provider }),
            ...(model && { 'x-model': model }),
        },
        body: JSON.stringify({ headers, sampleRows }),
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`LLM mapping failed: ${errorText}`);
    }

    return res.json();
}

import { ExtractedData } from '../types';

interface LLMConfig {
    apiKey?: string;
    provider?: string;
    model?: string;
}

export async function extractFromImage(
    imageBase64: string,
    config: LLMConfig | string
): Promise<ExtractedData> {
    const { apiKey, provider, model } = typeof config === 'string'
        ? { apiKey: config, provider: undefined, model: undefined }
        : config;

    const res = await fetch('/api/ai/extract-image', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(apiKey && apiKey !== 'SERVER_MANAGED' && { 'x-api-key': apiKey }),
            ...(provider && { 'x-provider': provider }),
            ...(model && { 'x-model': model }),
        },
        body: JSON.stringify({ image: imageBase64 }),
    });

    if (!res.ok) {
        const errorText = await res.text();
        let message: string | undefined;
        try {
            const json = JSON.parse(errorText) as { error?: string };
            message = json.error;
        } catch {}
        throw new Error(message || `Image extraction failed: ${errorText}`);
    }

    return res.json();
}

export function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            resolve(reader.result as string);
        };
        reader.onerror = error => reject(error);
    });
}

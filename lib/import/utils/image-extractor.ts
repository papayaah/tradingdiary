import { ExtractedData } from '../types';

interface LLMConfig {
    apiKey: string;
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

    if (!apiKey) {
        throw new Error('No API key provided for image extraction');
    }

    const res = await fetch('/api/ai/extract-image', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            ...(provider && { 'x-provider': provider }),
            ...(model && { 'x-model': model }),
        },
        body: JSON.stringify({ image: imageBase64 }),
    });

    if (!res.ok) {
        const errorText = await res.text();
        try {
            const json = JSON.parse(errorText);
            throw new Error(json.error || 'Image extraction failed');
        } catch (e) {
            throw new Error(`Image extraction failed: ${errorText}`);
        }
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

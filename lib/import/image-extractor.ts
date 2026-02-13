import { ExtractedData } from './types';

export async function extractFromImage(
    imageBase64: string,
    apiKey?: string
): Promise<ExtractedData> {
    if (!apiKey) {
        throw new Error('No API key provided for image extraction');
    }

    const res = await fetch('/api/ai/extract-image', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
        },
        body: JSON.stringify({ image: imageBase64 }),
    });

    if (!res.ok) {
        const errorText = await res.text();
        // Try to parse json error if possible
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
            // Remove "data:image/xyz;base64," prefix? 
            // Vercel AI SDK usually handles data URLs directly if passed as type:'image'.
            // But our API route expects full data URL or stripped?
            // Let's check API route: `const { image } = ...` -> passed to `type: 'image', image: image`.
            // The SDK supports data URLs. So passing the full result is correct.
            resolve(reader.result as string);
        };
        reader.onerror = error => reject(error);
    });
}

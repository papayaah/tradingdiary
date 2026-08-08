import Papa from 'papaparse';
import { ExtractedData } from '../types';

export function parseCSVOrText(content: string): Promise<ExtractedData> {
    return new Promise((resolve, reject) => {
        // Automatically skip leading metadata rows (common in Charles Schwab exports)
        let processedContent = content;
        const lines = content.split(/\r?\n/);

        // Find the index of the line that actually looks like a CSV header row
        // e.g. contains "Date" and ("Action" or "Symbol" or "Description" or "Quantity" or "Price")
        const headerIndex = lines.findIndex(line => {
            const lowerLine = line.toLowerCase();
            const hasDate = lowerLine.includes('date');
            const hasSymbol = lowerLine.includes('symbol');
            const hasAction = lowerLine.includes('action') || lowerLine.includes('side') || lowerLine.includes('type');
            const hasQuantity = lowerLine.includes('qty') || lowerLine.includes('quantity') || lowerLine.includes('shares');

            // If it matches date and at least two other common header fields, it's the header row
            const matches = [hasDate, hasSymbol, hasAction, hasQuantity].filter(Boolean).length;
            return matches >= 3;
        });

        if (headerIndex > 0) {
            processedContent = lines.slice(headerIndex).join('\n');
        }

        Papa.parse(processedContent, {
            header: true,
            skipEmptyLines: 'greedy',
            transformHeader: (header) => header.trim(),
            complete: (results) => {
                if (results.errors.length && !results.data.length) {
                    reject(new Error(`CSV parsing failed: ${results.errors[0]?.message}`));
                    return;
                }

                // Filter out completely empty rows (sometimes 'skipEmptyLines' misses rows with empty strings)
                const rows = (results.data as Record<string, string>[]).filter(row =>
                    Object.values(row).some(val => val && val.trim().length > 0)
                );

                if (rows.length === 0) {
                    resolve({ headers: [], rows: [] });
                    return;
                }

                // Get headers from the first row keys if parsed with header: true
                // Note: papaparse 'meta.fields' contains the headers
                const headers = results.meta.fields || Object.keys(rows[0]);

                resolve({
                    headers,
                    rows,
                });
            },
            error: (error: Error) => {
                reject(error);
            }
        });
    });
}

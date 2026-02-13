import Papa from 'papaparse';
import { ExtractedData } from './types';

export function parseCSVOrText(content: string): Promise<ExtractedData> {
    return new Promise((resolve, reject) => {
        Papa.parse(content, {
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

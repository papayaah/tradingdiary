import Papa from 'papaparse';
import { NormalizedTransaction } from '../../types';
import { normalizeDate, normalizeTime } from '../../utils/normalizer';

/**
 * Parser for eSignal Trade Log (CSV export with semicolon delimiter).
 */
export async function parseESignalTradeLog(content: string): Promise<NormalizedTransaction[]> {
    return new Promise((resolve, reject) => {
        Papa.parse(content, {
            header: true,
            delimiter: ';',
            skipEmptyLines: 'greedy',
            transformHeader: (header) => header.replace(/"/g, '').trim(),
            complete: (results) => {
                if (results.errors.length && !results.data.length) {
                    reject(new Error(`eSignal log parsing failed: ${results.errors[0]?.message}`));
                    return;
                }

                const rows = results.data as Record<string, string>[];
                if (!rows.length) {
                    resolve([]);
                    return;
                }

                const transactions: NormalizedTransaction[] = [];
                const priceMap = new Map<string, number>();

                rows.forEach((row) => {
                    const timestamp = (row.Timestamp || '').replace(/"/g, '').trim();
                    const symbol = (row.Symbol || '').replace(/"/g, '').trim();
                    const avgPriceStr = (row['Average Price'] || row['Avg Price'] || '').replace(/"/g, '').trim();
                    const price = parseFloat(avgPriceStr);
                    
                    if (symbol && timestamp && !isNaN(price) && price !== 0) {
                        const key = `${timestamp}_${symbol}`;
                        if (row.Category === 'Position' || !priceMap.has(key)) {
                            priceMap.set(key, price);
                        }
                    }
                });

                rows.forEach((row, index) => {
                    const category = (row.Category || '').replace(/"/g, '').trim();
                    if (category !== 'Execution') return;

                    const timestamp = (row.Timestamp || '').replace(/"/g, '').trim();
                    const symbol = (row.Symbol || '').replace(/"/g, '').trim();
                    const sideStr = (row['Buy/Sell'] || '').replace(/"/g, '').trim();
                    const qtyStr = (row.Quantity || '').replace(/"/g, '').trim();
                    const qty = Math.abs(parseFloat(qtyStr));

                    if (!symbol || isNaN(qty) || qty === 0) return;

                    let side: 'BUY' | 'SELL' = 'BUY';
                    const lowerSide = sideStr.toLowerCase();
                    if (lowerSide.includes('sell')) {
                        side = 'SELL';
                    }

                    const parts = timestamp.split(' ');
                    const date = normalizeDate(parts[0]);
                    const time = normalizeTime(parts[1] || '00:00:00');

                    const key = `${timestamp}_${symbol}`;
                    let price = priceMap.get(key);

                    if (price === undefined || isNaN(price) || price === 0) {
                        const rowPrice = parseFloat((row['Average Price'] || '').replace(/"/g, '').trim());
                        if (!isNaN(rowPrice) && rowPrice !== 0) {
                            price = rowPrice;
                        }
                    }

                    if (price === undefined || isNaN(price) || price === 0) {
                        for (let i = Math.max(0, index - 5); i <= Math.min(rows.length - 1, index + 5); i++) {
                            const r = rows[i];
                            if (r.Symbol === row.Symbol) {
                                const p = parseFloat((r['Average Price'] || '').replace(/"/g, '').trim());
                                if (!isNaN(p) && p !== 0) {
                                    price = p;
                                    break;
                                }
                            }
                        }
                    }

                    if (price === undefined || isNaN(price) || price === 0) {
                        const summary = (row.Summary || '').replace(/"/g, '');
                        const atMatch = summary.match(/@\s*([\d.]+)/);
                        if (atMatch) {
                            price = parseFloat(atMatch[1]);
                        }
                    }

                    transactions.push({
                        symbol,
                        side,
                        date,
                        time,
                        quantity: qty,
                        price: price || 0,
                        orderId: `esignal-${timestamp}-${symbol}-${index}`,
                        currency: 'USD',
                    });
                });

                resolve(transactions);
            },
            error: (error: Error) => {
                reject(error);
            }
        });
    });
}

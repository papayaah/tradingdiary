import Papa from 'papaparse';
import { NormalizedTransaction } from './types';
import { normalizeDate, normalizeTime } from './normalizer';

/**
 * Parser for eSignal Trade Log (CSV export with semicolon delimiter).
 * 
 * eSignal Trade Logs are event-based and contain multiple categories of data:
 * - Balance: Account balance updates
 * - Position: Snapshots of current positions (often contains the average price)
 * - Broker Order: Order placement/modification/cancellation (often contains the limit/average price)
 * - Execution: Individual fill events (contains the quantity executed but sometimes lacks the price)
 * - Broker Message: Logs from the broker
 * 
 * This parser groups executions and attempts to find the corresponding fill price from surrounding
 * events (Position or Broker Order rows) for the same symbol at or near the same time.
 */
export async function parseESignalTradeLog(content: string): Promise<NormalizedTransaction[]> {
    return new Promise((resolve, reject) => {
        // eSignal uses semicolon as default delimiter in many regions
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

                const rows = results.data as any[];
                if (!rows.length) {
                    resolve([]);
                    return;
                }

                const transactions: NormalizedTransaction[] = [];

                // Step 1: Pre-process rows to find prices
                // eSignal often puts the fill price in a 'Position' or 'Broker Order' row
                // that shares the same timestamp as the 'Execution' row.
                const priceMap = new Map<string, number>();

                rows.forEach((row) => {
                    const timestamp = (row.Timestamp || '').replace(/"/g, '').trim();
                    const symbol = (row.Symbol || '').replace(/"/g, '').trim();
                    const avgPriceStr = (row['Average Price'] || row['Avg Price'] || '').replace(/"/g, '').trim();
                    const price = parseFloat(avgPriceStr);
                    
                    if (symbol && timestamp && !isNaN(price) && price !== 0) {
                        // Key by timestamp + symbol
                        const key = `${timestamp}_${symbol}`;
                        // We prefer the 'Position' price as it's usually the most accurate "realized" price after the fill
                        if (row.Category === 'Position' || !priceMap.has(key)) {
                            priceMap.set(key, price);
                        }
                    }
                });

                // Step 2: Extract executions
                rows.forEach((row, index) => {
                    const category = (row.Category || '').replace(/"/g, '').trim();
                    if (category !== 'Execution') return;

                    const timestamp = (row.Timestamp || '').replace(/"/g, '').trim();
                    const symbol = (row.Symbol || '').replace(/"/g, '').trim();
                    const sideStr = (row['Buy/Sell'] || '').replace(/"/g, '').trim();
                    const qtyStr = (row.Quantity || '').replace(/"/g, '').trim();
                    let qty = Math.abs(parseFloat(qtyStr));

                    if (!symbol || isNaN(qty) || qty === 0) return;

                    // Side mapping: eSignal uses "Buy", "Sell", "Buy To Cover", "Sell Short"
                    let side: 'BUY' | 'SELL' = 'BUY';
                    const lowerSide = sideStr.toLowerCase();
                    if (lowerSide.includes('sell')) {
                        side = 'SELL';
                    }

                    // Date/Time parsing: "2026-03-20 02:34:24"
                    const parts = timestamp.split(' ');
                    const date = normalizeDate(parts[0]);
                    const time = normalizeTime(parts[1] || '00:00:00');

                    // Price lookup: Try exact match first
                    const key = `${timestamp}_${symbol}`;
                    let price = priceMap.get(key);

                    // Fallback 1: Check if the row itself has a price (sometimes it does)
                    if (price === undefined || isNaN(price) || price === 0) {
                        const rowPrice = parseFloat((row['Average Price'] || '').replace(/"/g, '').trim());
                        if (!isNaN(rowPrice) && rowPrice !== 0) {
                            price = rowPrice;
                        }
                    }

                    // Fallback 2: Look in surrounding rows (within a 10-row window)
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

                    // Final Fallback 3: Parse from Summary if possible (e.g. "Buy 300 @ 150.50 @ SOXL")
                    // Note: The sample didn't show prices in Execution summaries, but some eSignal versions do.
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
                        currency: 'USD', // Defaults to USD for eSignal
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

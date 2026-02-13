import { NormalizedTransaction, ColumnMapping } from './types';

const COLUMN_ALIASES: Record<keyof NormalizedTransaction, string[]> = {
    symbol: ['symbol', 'ticker', 'stock', 'stock name', 'instrument', 'name', 'security'],
    side: ['side', 'action', 'b/s', 'buy/sell', 'type', 'direction', 'trade type'],
    date: ['date', 'trade date', 'execution date', 'create date', 'create date & time', 'datetime', 'time'],
    quantity: ['quantity', 'qty', 'shares', 'volume', 'size', 'order quantity', 'confirmed quantity', 'lots'],
    price: ['price', 'executed price', 'exec price', 'avg price', 'fill price', 'average price', 'trade price'],
    time: ['time', 'execution time', 'trade time'],
    orderId: ['order id', 'trade id', 'id', 'ref', 'reference', 'order no'],
    companyName: ['company', 'company name', 'stock name', 'name', 'description'],
    currency: ['currency', 'ccy', 'cur'],
    orderType: ['order type', 'type', 'order kind'],
    commission: ['commission', 'fee', 'fees', 'brokerage'],
    stockCode: ['stock code', 'code', 'isin', 'sedol'],
    totalValue: ['total', 'total value', 'amount', 'value', 'net amount', 'consideration'],
};

export function mapColumnsOffline(headers: string[]): ColumnMapping {
    const mapping: Partial<ColumnMapping> = {};
    const usedHeaders = new Set<string>();

    // Normalize a string for comparison: lowercase, remove non-alphanumeric
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    // For each field in our schema, look for a matching header
    for (const field of Object.keys(COLUMN_ALIASES) as (keyof NormalizedTransaction)[]) {
        const aliases = COLUMN_ALIASES[field];

        // Try to find a header that matches one of the aliases
        for (const header of headers) {
            if (usedHeaders.has(header)) continue;

            const normHeader = normalize(header);

            // Check full match or if header contains alias (e.g. "Order Price" contains "price")
            // We prioritize exact matches in aliases list
            const match = aliases.some(alias => {
                const normAlias = normalize(alias);
                return normHeader === normAlias || (normHeader.includes(normAlias) && normAlias.length > 3);
            });

            if (match) {
                mapping[field] = header;
                usedHeaders.add(header);
                break; // Move to next field
            }
        }
    }

    return mapping as ColumnMapping;
}

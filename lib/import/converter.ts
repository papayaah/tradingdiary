import { NormalizedTransaction } from './types';
import { TransactionRecord } from '@/lib/db/schema';

export function toTransactionRecord(
    n: NormalizedTransaction,
    accountId: string,
    index: number
): TransactionRecord {
    const dateStr = n.date; // assuming validated date string
    const time = n.time || '00:00:00';
    const tradeId = n.orderId || `${accountId}-${dateStr.replace(/[^0-9]/g, '')}-${index}-${Date.now()}`;

    // Default side logic for Phase 1
    let side: TransactionRecord['side'] = 'BUYTOOPEN';
    if (n.side === 'SELL') {
        side = 'SELLTOCLOSE';
    }

    // Handle quantity sign convention if needed (spec 9.1 says keep positive in DB, use side)
    // Schema says quantity: number. Usually positive.

    return {
        tradeId,
        accountId,
        symbol: n.symbol,
        companyName: n.companyName || n.symbol,
        exchanges: n.exchanges || '',
        side,
        orderType: n.orderType || 'MARKET',
        date: dateStr,
        time,
        currency: n.currency || 'USD',
        quantity: Math.abs(n.quantity),
        multiplier: 1,
        price: Math.abs(n.price),
        totalValue: n.totalValue ?? (Math.abs(n.quantity) * Math.abs(n.price)),
        commission: n.commission || 0,
        feeMultiplier: 1,
    };
}

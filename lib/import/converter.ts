import { NormalizedTransaction } from './types';
import { TransactionRecord } from '@/lib/db/schema';

export interface ConversionState {
    positions: Record<string, number>; // symbol -> running qty
}

export function toTransactionRecord(
    n: NormalizedTransaction,
    accountId: string,
    index: number,
    state: ConversionState,
    defaultCurrency: string = 'USD'
): TransactionRecord {
    const symbol = n.symbol;
    const currentPos = state.positions[symbol] || 0;
    const qty = Math.abs(n.quantity);
    const dateStr = n.date;
    const time = n.time || '00:00:00';
    const tradeId = n.orderId || `${accountId}-${dateStr.replace(/[^0-9]/g, '')}-${index}-${Date.now()}`;

    let side: TransactionRecord['side'];

    if (n.side === 'BUY') {
        if (currentPos >= 0) {
            side = 'BUYTOOPEN'; // Adding to long
        } else {
            side = 'BUYTOCLOSE'; // Closing short
        }
        state.positions[symbol] = currentPos + qty;
    } else {
        // SELL
        if (currentPos > 0) {
            side = 'SELLTOCLOSE'; // Closing long
        } else {
            side = 'SELLTOOPEN'; // Opening short
        }
        state.positions[symbol] = currentPos - qty;
    }

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
        currency: n.currency || defaultCurrency,
        quantity: qty,
        multiplier: 1,
        price: Math.abs(n.price),
        totalValue: n.totalValue ?? (qty * Math.abs(n.price)),
        commission: n.commission || 0,
        feeMultiplier: 1,
        realizedPnL: n.realizedPnL,
        unrealizedPnL: n.unrealizedPnL,
    };
}

export function toTransactionRecords(
    normalized: NormalizedTransaction[],
    accountId: string,
    defaultCurrency: string = 'USD'
): TransactionRecord[] {
    const state: ConversionState = { positions: {} };
    // Sort chronologically just in case to ensure side tracking works
    const sorted = [...normalized].sort((a, b) => {
        const dateCmp = a.date.localeCompare(b.date);
        if (dateCmp !== 0) return dateCmp;
        return (a.time || '').localeCompare(b.time || '');
    });

    return sorted.map((n, i) => toTransactionRecord(n, accountId, i, state, defaultCurrency));
}

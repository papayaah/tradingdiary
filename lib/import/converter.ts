import { NormalizedTransaction } from './types';
import { TransactionRecord } from '@/lib/db/schema';
import { cyrb53 } from './hash';
import { compareExecutionOrder } from '@/lib/trading/execution-order';

export interface ConversionState {
    positions: Record<string, number>; // symbol -> running qty
    /**
     * Occurrence counter per identity tuple. Genuinely identical fills (same
     * symbol/side/time/qty/price and no order id) get distinct but deterministic
     * ids, and the count stays stable across re-imports because the file order is
     * stable.
     */
    occurrences: Map<string, number>;
}

export function toTransactionRecord(
    n: NormalizedTransaction,
    accountId: string,
    state: ConversionState,
    defaultCurrency: string = 'USD'
): TransactionRecord {
    const symbol = n.symbol;
    const currentPos = state.positions[symbol] || 0;
    const qty = Math.abs(n.quantity);
    const dateStr = n.date;
    const time = n.time || '00:00:00';
    const price = Math.abs(n.price);
    const multiplier = n.multiplier && n.multiplier > 0 ? n.multiplier : 1;

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

    // Deterministic execution identity. Re-importing the same file must never
    // mint new records — the id is derived purely from stable execution content,
    // never Date.now(). This is what makes duplicate detection and cross-device
    // sync idempotent (see lib/journal/execution-key.ts). The occurrence counter
    // disambiguates genuinely identical fills while staying stable across
    // re-imports of the same source.
    const identity = [
        accountId,
        n.orderId?.trim() || '',
        symbol,
        n.side,
        dateStr,
        time,
        qty,
        price,
    ].join('|');
    const occurrence = state.occurrences.get(identity) ?? 0;
    state.occurrences.set(identity, occurrence + 1);
    const tradeId = `ex_${cyrb53(identity)}_${occurrence}`;

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
        multiplier,
        price: Math.abs(n.price),
        totalValue: n.totalValue ?? (qty * Math.abs(n.price) * multiplier),
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
    const state: ConversionState = { positions: {}, occurrences: new Map() };
    // Chronological order drives the open/close (position) derivation. Same-second
    // fills tie-break on the broker order id so the derivation is deterministic and
    // never flips a fill between open/close on re-import.
    const sorted = [...normalized].sort((a, b) =>
        compareExecutionOrder(a, b, a.orderId, b.orderId),
    );

    return sorted.map((n) => toTransactionRecord(n, accountId, state, defaultCurrency));
}

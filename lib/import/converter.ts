import { NormalizedTransaction } from './types';
import { TransactionRecord } from '@/lib/db/schema';

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

// cyrb53 — a fast, well-distributed non-cryptographic hash. Deterministic and
// dependency-free (no Date/Math.random), so the same execution content always
// yields the same id. 53 bits of range makes collisions negligible at journal
// scale.
function hashIdentity(str: string): string {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return hash.toString(36);
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
        side,
        dateStr,
        time,
        qty,
        price,
    ].join('|');
    const occurrence = state.occurrences.get(identity) ?? 0;
    state.occurrences.set(identity, occurrence + 1);
    const tradeId = `ex_${hashIdentity(identity)}_${occurrence}`;

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
    const state: ConversionState = { positions: {}, occurrences: new Map() };
    // Sort chronologically just in case to ensure side tracking works
    const sorted = [...normalized].sort((a, b) => {
        const dateCmp = a.date.localeCompare(b.date);
        if (dateCmp !== 0) return dateCmp;
        return (a.time || '').localeCompare(b.time || '');
    });

    return sorted.map((n) => toTransactionRecord(n, accountId, state, defaultCurrency));
}

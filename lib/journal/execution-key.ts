import type { TransactionRecord } from '../db/schema';

/**
 * Deterministic content key for an execution. Blocks duplicate imports and makes
 * guest→account adoption idempotent: the unique index is (userId, idempotencyKey),
 * so userId is intentionally excluded here. See
 * docs/specs/journal-persistence-and-sync.md.
 */
export function executionIdempotencyKey(t: TransactionRecord): string {
  return [
    t.accountId,
    t.tradeId,
    t.symbol,
    t.side,
    t.date,
    t.time,
    t.quantity,
    t.price,
  ].join('|');
}

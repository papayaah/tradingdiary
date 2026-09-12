'use client';

import { getDB } from '@/lib/db/database';
import { getTransactionsByAccount } from '@/lib/db/trades';
import { aggregateByDay, type AggregatedTrade, type DailySummary } from '@/lib/trading/aggregator';
import type { StoredDaySummary, TransactionRecord } from '@/lib/db/schema';

/**
 * Materialized read model for day summaries. Aggregating an account's whole
 * history (FX backfill + cross-day FIFO) is the expensive part of loading the
 * dashboard and journal; we do it once at write time and persist the compact
 * result (no raw transactions) so cold loads and reloads just read rows.
 *
 * Expand-time consumers (trade detail, replay, chart, AI review) hydrate the raw
 * executions on demand via loadTransactionsByIds using each trade's
 * `transactionIds`.
 */

/** Drop raw transactions from a trade, keeping the compact read-model fields. */
function toLiteTrade(trade: AggregatedTrade): AggregatedTrade {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { transactions, ...lite } = trade;
  return lite;
}

function toStored(accountId: string, summaries: DailySummary[]): StoredDaySummary[] {
  return summaries.map((day) => ({
    ...day,
    accountId,
    trades: day.trades.map(toLiteTrade),
  }));
}

async function persist(accountId: string, summaries: DailySummary[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('daySummaries', 'readwrite');
  const store = tx.objectStore('daySummaries');
  // Replace this account's rows wholesale — cross-day FIFO means a single write
  // can shift cost basis across days, so partial updates aren't safe.
  const keys = await store.index('by-accountId').getAllKeys(accountId);
  await Promise.all(keys.map((key) => store.delete(key)));
  await Promise.all(toStored(accountId, summaries).map((row) => store.put(row)));
  await tx.done;
}

/**
 * Rebuild an account's summaries from its executions and persist the compact
 * model. Returns the FULL summaries (transactions attached) so the caller that
 * triggered the rebuild can use them this session without re-reading.
 */
export async function rebuildDaySummaries(accountId: string): Promise<DailySummary[]> {
  const transactions = await getTransactionsByAccount(accountId);
  const summaries = transactions.length > 0 ? aggregateByDay(transactions) : [];
  await persist(accountId, summaries);
  return summaries;
}

/**
 * Read the persisted compact summaries for an account (newest first), or null
 * when nothing is stored yet (never built, or invalidated) — the caller should
 * then rebuild.
 */
export async function readStoredDaySummaries(accountId: string): Promise<DailySummary[] | null> {
  const db = await getDB();
  const rows = await db.getAllFromIndex('daySummaries', 'by-accountId', accountId);
  if (rows.length === 0) return null;
  // The extra `accountId` field is harmless to summary consumers; keep it rather
  // than allocate a stripped copy per row.
  return (rows as DailySummary[])
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Drop an account's persisted summaries (or all accounts') so the next read rebuilds. */
export async function clearStoredDaySummaries(accountId?: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('daySummaries', 'readwrite');
  const store = tx.objectStore('daySummaries');
  if (accountId) {
    const keys = await store.index('by-accountId').getAllKeys(accountId);
    await Promise.all(keys.map((key) => store.delete(key)));
  } else {
    await store.clear();
  }
  await tx.done;
}

/** Load raw executions by their ids (keyed gets) — the lazy hydration primitive. */
export async function loadTransactionsByIds(ids: string[]): Promise<TransactionRecord[]> {
  if (ids.length === 0) return [];
  const db = await getDB();
  const tx = db.transaction('transactions', 'readonly');
  const store = tx.objectStore('transactions');
  const records = await Promise.all(ids.map((id) => store.get(id)));
  await tx.done;
  return records.filter((record): record is TransactionRecord => record != null);
}

/** Raw executions for one compact trade (returns already-attached fills if present). */
export async function hydrateTradeTransactions(trade: AggregatedTrade): Promise<TransactionRecord[]> {
  if (trade.transactions && trade.transactions.length > 0) return trade.transactions;
  return loadTransactionsByIds(trade.transactionIds ?? []);
}

/** Raw executions for a whole day across all its trades (for replay timelines). */
export async function hydrateDayTransactions(summary: DailySummary): Promise<TransactionRecord[]> {
  const ids = summary.trades.flatMap(
    (trade) => trade.transactionIds ?? trade.transactions?.map((t) => t.tradeId) ?? [],
  );
  return loadTransactionsByIds([...new Set(ids)]);
}

import { getDB } from './database';
import type { ImportBatchRecord } from './schema';
import { notifyJournalChanged } from '@/lib/journal/sync-bus';

/**
 * Which of a batch's executions should actually be removed on undo: only ids the
 * batch created that are still present. An execution already deleted, or re-owned
 * by nothing else (dedup guarantees each id is created by exactly one batch), is
 * simply skipped. Pure so it can be unit-tested without IndexedDB.
 */
export function executionsToRemove(
  batchTradeIds: string[],
  existingIds: Set<string>,
): string[] {
  return [...new Set(batchTradeIds)].filter((id) => existingIds.has(id));
}

export async function recordImportBatch(batch: ImportBatchRecord): Promise<void> {
  const db = await getDB();
  await db.put('importBatches', batch);
}

/** Import history, newest first. Optionally scoped to one account. */
export async function getImportBatches(accountId?: string): Promise<ImportBatchRecord[]> {
  const db = await getDB();
  const batches = accountId
    ? await db.getAllFromIndex('importBatches', 'by-accountId', accountId)
    : await db.getAll('importBatches');
  return batches.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Undo an import batch: delete only the executions it created (that still exist),
 * then delete the batch record. Positions are derived from transactions at read
 * time, so nothing else needs recomputing. Deletions propagate to the server via
 * the sync engine (notifyJournalChanged → tombstones).
 */
export async function undoImportBatch(id: string): Promise<{ removed: number }> {
  const db = await getDB();
  const batch = await db.get('importBatches', id);
  if (!batch) return { removed: 0 };

  const tx = db.transaction(['transactions', 'importBatches'], 'readwrite');
  const txStore = tx.objectStore('transactions');

  const existing = new Set(
    (await txStore.index('by-accountId').getAllKeys(batch.accountId)).map((k) => String(k)),
  );
  const toRemove = executionsToRemove(batch.tradeIds, existing);
  for (const tradeId of toRemove) {
    await txStore.delete(tradeId);
  }
  await tx.objectStore('importBatches').delete(id);
  await tx.done;

  if (toRemove.length > 0) notifyJournalChanged();
  return { removed: toRemove.length };
}

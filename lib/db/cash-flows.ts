import { getDB } from './database';
import type { CashFlowRecord } from './schema';
import { notifyJournalChanged } from '@/lib/journal/sync-bus';

/** All cash flows for an account, oldest first. */
export async function getCashFlows(accountId: string): Promise<CashFlowRecord[]> {
  const db = await getDB();
  // A stale connection (older IndexedDB version held open by another tab) may not
  // have this store yet; degrade to empty until the tab reloads and upgrades.
  if (!db.objectStoreNames.contains('cashFlows')) return [];
  const rows = await db.getAllFromIndex('cashFlows', 'by-accountId', accountId);
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/** Every cash flow across all accounts (used by sync and export). */
export async function getAllCashFlows(): Promise<CashFlowRecord[]> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('cashFlows')) return [];
  return db.getAll('cashFlows');
}

export async function saveCashFlow(record: CashFlowRecord): Promise<void> {
  const db = await getDB();
  await db.put('cashFlows', record);
  notifyJournalChanged();
}

export async function deleteCashFlow(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('cashFlows', id);
  notifyJournalChanged();
}

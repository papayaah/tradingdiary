import { getDB } from './database';
import type { TransactionRecord, AccountRecord, PositionRecord } from './schema';

export async function importData(
  account: AccountRecord,
  transactions: TransactionRecord[],
  positions: PositionRecord[]
) {
  const db = await getDB();
  const tx = db.transaction(['accounts', 'transactions', 'positions'], 'readwrite');

  await tx.objectStore('accounts').put(account);

  const txStore = tx.objectStore('transactions');
  for (const t of transactions) {
    await txStore.put(t);
  }

  const posStore = tx.objectStore('positions');
  const existingPositions = await posStore.index('by-accountId').getAll(account.accountId);
  for (const pos of existingPositions) {
    if (pos.id !== undefined) {
      await posStore.delete(pos.id);
    }
  }
  for (const pos of positions) {
    await posStore.add(pos);
  }

  await tx.done;
}

export async function getAllTransactions(): Promise<TransactionRecord[]> {
  const db = await getDB();
  return db.getAll('transactions');
}

export async function getTransactionCount(): Promise<number> {
  const db = await getDB();
  return db.count('transactions');
}

export async function clearAllData() {
  const db = await getDB();
  const tx = db.transaction(
    ['accounts', 'transactions', 'positions', 'dailyNotes', 'tradeNotes'],
    'readwrite'
  );
  await tx.objectStore('accounts').clear();
  await tx.objectStore('transactions').clear();
  await tx.objectStore('positions').clear();
  await tx.objectStore('dailyNotes').clear();
  await tx.objectStore('tradeNotes').clear();
  await tx.done;
}

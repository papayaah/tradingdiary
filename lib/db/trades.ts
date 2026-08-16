import { getDB } from './database';
import type { TransactionRecord, AccountRecord, PositionRecord } from './schema';
import { enrichTransactionsWithHistoricalFx } from '@/lib/fx/enrich-transactions';
import { notifyJournalChanged } from '@/lib/journal/sync-bus';

async function persistFxBackfill(
  account: AccountRecord | undefined,
  transactions: TransactionRecord[],
): Promise<TransactionRecord[]> {
  if (!account || transactions.length === 0) return transactions;
  const target = account.currency.toUpperCase();
  const needsFx = transactions.some((transaction) =>
    transaction.currency.toUpperCase() !== target &&
    (
      !transaction.fxRateToAccount ||
      transaction.fxAccountCurrency !== target ||
      transaction.fxRateDate !== transaction.date ||
      transaction.fxRateProvider !== 'exchange-rate-api'
    ),
  );
  if (!needsFx) return transactions;

  const enriched = await enrichTransactionsWithHistoricalFx(transactions, target);
  const db = await getDB();
  const tx = db.transaction('transactions', 'readwrite');
  await Promise.all(enriched.map((transaction) => tx.store.put(transaction)));
  await tx.done;
  return enriched;
}

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
  notifyJournalChanged();
}

export async function getAccounts(): Promise<AccountRecord[]> {
  const db = await getDB();
  return db.getAll('accounts');
}

export async function updateAccount(account: AccountRecord) {
  const db = await getDB();
  await db.put('accounts', account);
  notifyJournalChanged();
}

export async function getAllTransactions(): Promise<TransactionRecord[]> {
  const db = await getDB();
  const [transactions, accounts] = await Promise.all([
    db.getAll('transactions'),
    db.getAll('accounts'),
  ]);
  const accountById = new Map(accounts.map((account) => [account.accountId, account]));
  const byAccount = new Map<string, TransactionRecord[]>();
  for (const transaction of transactions) {
    const group = byAccount.get(transaction.accountId) ?? [];
    group.push(transaction);
    byAccount.set(transaction.accountId, group);
  }
  const enriched = await Promise.all(
    [...byAccount.entries()].map(([accountId, group]) =>
      persistFxBackfill(accountById.get(accountId), group),
    ),
  );
  return enriched.flat();
}

export async function getTransactionCount(): Promise<number> {
  const db = await getDB();
  return db.count('transactions');
}

export async function getTransactionsByAccount(accountId: string): Promise<TransactionRecord[]> {
  const db = await getDB();
  const [account, transactions] = await Promise.all([
    db.get('accounts', accountId),
    db.getAllFromIndex('transactions', 'by-accountId', accountId),
  ]);
  return persistFxBackfill(account, transactions);
}

export async function saveManualTransaction(
  account: AccountRecord | null,
  transaction: TransactionRecord
) {
  const db = await getDB();
  const stores = account ? ['accounts', 'transactions'] as const : ['transactions'] as const;
  const tx = db.transaction(stores, 'readwrite');

  if (account) {
    await tx.objectStore('accounts').put(account);
  }
  await tx.objectStore('transactions').put(transaction);
  await tx.done;
  notifyJournalChanged();
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

export async function deleteAccount(accountId: string) {
  const db = await getDB();
  const tx = db.transaction(['accounts', 'transactions', 'positions'], 'readwrite');
  
  await tx.objectStore('accounts').delete(accountId);

  const txStore = tx.objectStore('transactions');
  const accountTxns = await txStore.index('by-accountId').getAllKeys(accountId);
  for (const key of accountTxns) {
    await txStore.delete(key);
  }

  const posStore = tx.objectStore('positions');
  const accountPositions = await posStore.index('by-accountId').getAll(accountId);
  for (const pos of accountPositions) {
    if (pos.id !== undefined) {
      await posStore.delete(pos.id);
    }
  }

  await tx.done;
}

export async function deleteAccountTrades(accountId: string) {
  const db = await getDB();
  const tx = db.transaction(['transactions', 'positions'], 'readwrite');
  
  const txStore = tx.objectStore('transactions');
  const accountTxns = await txStore.index('by-accountId').getAllKeys(accountId);
  for (const key of accountTxns) {
    await txStore.delete(key);
  }

  const posStore = tx.objectStore('positions');
  const accountPositions = await posStore.index('by-accountId').getAll(accountId);
  for (const pos of accountPositions) {
    if (pos.id !== undefined) {
      await posStore.delete(pos.id);
    }
  }

  await tx.done;
}

export async function deleteTradesByDateRange(
  startDate: string,
  endDate: string,
  accountId?: string
): Promise<number> {
  const db = await getDB();
  const tx = db.transaction(['transactions', 'positions'], 'readwrite');
  const txStore = tx.objectStore('transactions');
  
  let txns: TransactionRecord[] = [];
  if (accountId && accountId !== 'all') {
    txns = await txStore.index('by-accountId').getAll(accountId);
  } else {
    txns = await txStore.getAll();
  }

  // Filter transactions within the date range (formatted as YYYY-MM-DD or YYYYMMDD)
  const cleanStart = startDate.replace(/-/g, '');
  const cleanEnd = endDate.replace(/-/g, '');

  let count = 0;
  for (const t of txns) {
    const cleanDate = t.date.replace(/-/g, '');
    if (cleanDate >= cleanStart && cleanDate <= cleanEnd) {
      await txStore.delete(t.tradeId);
      count++;
    }
  }

  // Recalculate/clear positions for affected accounts if needed
  if (count > 0 && accountId && accountId !== 'all') {
    const posStore = tx.objectStore('positions');
    const accountPositions = await posStore.index('by-accountId').getAll(accountId);
    for (const pos of accountPositions) {
      if (pos.id !== undefined) {
        await posStore.delete(pos.id);
      }
    }
  }

  await tx.done;
  return count;
}

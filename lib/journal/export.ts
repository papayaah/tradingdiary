import { getDB } from '../db/database';
import type {
  AccountRecord,
  TransactionRecord,
  DailyNoteRecord,
  TradeNoteRecord,
  TradeAIReviewRecord,
  CashFlowRecord,
} from '../db/schema';
import { notifyJournalChanged } from './sync-bus';

/**
 * Full journal backup: export to a portable JSON file, restore from one, and
 * export executions to CSV. Covers the launch-safety requirement that all
 * user-owned data be exportable and restorable (spec P0 #6).
 */

export const BACKUP_VERSION = 1;

export interface JournalBackup {
  version: number;
  exportedAt: string;
  accounts: AccountRecord[];
  transactions: TransactionRecord[];
  cashFlows: CashFlowRecord[];
  dailyNotes: DailyNoteRecord[];
  tradeNotes: TradeNoteRecord[];
  reviews: TradeAIReviewRecord[];
}

export async function buildJournalBackup(): Promise<JournalBackup> {
  const db = await getDB();
  const [accounts, transactions, cashFlows, dailyNotes, tradeNotes, reviews] = await Promise.all([
    db.getAll('accounts'),
    db.getAll('transactions'),
    db.getAll('cashFlows'),
    db.getAll('dailyNotes'),
    db.getAll('tradeNotes'),
    db.getAll('tradeAIReviews'),
  ]);
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    accounts,
    transactions,
    cashFlows,
    dailyNotes,
    tradeNotes,
    reviews,
  };
}

function triggerDownload(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Download the whole journal as a JSON backup. */
export async function downloadJournalBackup(): Promise<void> {
  const backup = await buildJournalBackup();
  triggerDownload(
    `trading-diary-backup-${dateStamp()}.json`,
    JSON.stringify(backup, null, 2),
    'application/json',
  );
}

const CSV_COLUMNS: (keyof TransactionRecord)[] = [
  'tradeId', 'accountId', 'symbol', 'companyName', 'side', 'date', 'time',
  'currency', 'quantity', 'multiplier', 'price', 'totalValue', 'commission',
  'realizedPnL',
];

function csvCell(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Download all executions as a CSV. */
export async function downloadExecutionsCsv(): Promise<void> {
  const db = await getDB();
  const transactions = await db.getAll('transactions');
  const header = CSV_COLUMNS.join(',');
  const rows = transactions.map((t) => CSV_COLUMNS.map((c) => csvCell(t[c])).join(','));
  triggerDownload(
    `trading-diary-executions-${dateStamp()}.csv`,
    [header, ...rows].join('\n'),
    'text/csv',
  );
}

export interface RestoreResult {
  accounts: number;
  transactions: number;
  cashFlows: number;
  dailyNotes: number;
  tradeNotes: number;
  reviews: number;
}

/** Restore a JSON backup into IndexedDB (additive; existing rows are overwritten
 * by key). Triggers a sync push when signed in. */
export async function restoreJournalBackup(json: string): Promise<RestoreResult> {
  const parsed = JSON.parse(json) as Partial<JournalBackup>;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.accounts)) {
    throw new Error('Not a valid Trading Diary backup file.');
  }

  const db = await getDB();
  const accounts = parsed.accounts ?? [];
  const transactions = parsed.transactions ?? [];
  const cashFlows = parsed.cashFlows ?? [];
  const dailyNotes = parsed.dailyNotes ?? [];
  const tradeNotes = parsed.tradeNotes ?? [];
  const reviews = parsed.reviews ?? [];

  const tx = db.transaction(
    ['accounts', 'transactions', 'cashFlows', 'dailyNotes', 'tradeNotes', 'tradeAIReviews'],
    'readwrite',
  );
  await Promise.all([
    ...accounts.map((a) => tx.objectStore('accounts').put(a)),
    ...transactions.map((t) => tx.objectStore('transactions').put(t)),
    ...cashFlows.map((c) => tx.objectStore('cashFlows').put(c)),
    ...dailyNotes.map((n) => tx.objectStore('dailyNotes').put(n)),
    ...tradeNotes.map((n) => tx.objectStore('tradeNotes').put(n)),
    ...reviews.map((r) => tx.objectStore('tradeAIReviews').put(r)),
  ]);
  await tx.done;
  notifyJournalChanged();

  return {
    accounts: accounts.length,
    transactions: transactions.length,
    cashFlows: cashFlows.length,
    dailyNotes: dailyNotes.length,
    tradeNotes: tradeNotes.length,
    reviews: reviews.length,
  };
}

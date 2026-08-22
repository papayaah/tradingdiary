import { and, eq, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { AccountRecord, TransactionRecord } from '@/lib/db/schema';
import { db } from '@/lib/db/server';
import { ibkrFlexConnection } from '@/lib/db/server/schema';
import { detectAndParseBroker } from '@/lib/import/registry';
import { toTransactionRecords } from '@/lib/import/converter';
import type { NormalizedTransaction } from '@/lib/import/types';
import { pushJournal } from '@/lib/journal/server-sync';
import type { JournalPushRequest } from '@/lib/journal/sync-types';
import { decryptFlexToken } from './crypto';
import { IbkrFlexApiError, retrieveFlexStatement } from './client';
import { nextDailyFlexSync } from './schedule';
import type { IbkrFlexSyncProgress, IbkrFlexSyncResult } from './types';

const CLAIM_STALE_MS = 15 * 60 * 1000;

function accountClientId(brokerAccountId: string): string {
  return `ibkr-flex:${brokerAccountId || 'default'}`;
}

function mostCommonCurrency(transactions: NormalizedTransaction[]): string {
  const counts = new Map<string, number>();
  for (const transaction of transactions) {
    const currency = (transaction.currency || 'USD').toUpperCase();
    counts.set(currency, (counts.get(currency) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD';
}

function buildJournalPayload(transactions: NormalizedTransaction[]): JournalPushRequest {
  const byBrokerAccount = new Map<string, NormalizedTransaction[]>();
  for (const transaction of transactions) {
    const brokerAccount = transaction.accountId?.trim() || 'default';
    const rows = byBrokerAccount.get(brokerAccount) ?? [];
    rows.push(transaction);
    byBrokerAccount.set(brokerAccount, rows);
  }

  const accounts: AccountRecord[] = [];
  const executions: TransactionRecord[] = [];
  for (const [brokerAccount, rows] of byBrokerAccount) {
    const clientId = accountClientId(brokerAccount);
    const currency = mostCommonCurrency(rows);
    accounts.push({
      accountId: clientId,
      name: brokerAccount === 'default' ? 'Interactive Brokers' : `IBKR •${brokerAccount.slice(-4)}`,
      type: 'Interactive Brokers',
      currency,
      address: '',
      importedAt: Date.now(),
    });
    executions.push(...toTransactionRecords(rows, clientId, currency));
  }

  return {
    accounts,
    executions,
    cashFlows: [],
    dailyNotes: [],
    tradeNotes: [],
    tags: [],
    tradeTags: [],
    reviews: [],
    deletes: [],
  };
}

async function claimConnection(userId: string, now: Date) {
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS).toISOString();
  const [connection] = await db
    .update(ibkrFlexConnection)
    .set({ status: 'syncing', lastAttemptAt: now.toISOString(), updatedAt: now.toISOString() })
    .where(and(
      eq(ibkrFlexConnection.userId, userId),
      or(
        ne(ibkrFlexConnection.status, 'syncing'),
        isNull(ibkrFlexConnection.lastAttemptAt),
        lt(ibkrFlexConnection.lastAttemptAt, staleBefore),
      ),
    ))
    .returning();
  return connection;
}

function retryAt(now: Date, consecutiveFailures: number): Date {
  const delayMinutes = Math.min(6 * 60, 30 * 2 ** Math.min(consecutiveFailures, 4));
  return new Date(now.getTime() + delayMinutes * 60 * 1000);
}

export async function syncIbkrFlexConnection(
  userId: string,
  now = new Date(),
  onProgress?: (progress: IbkrFlexSyncProgress) => void,
): Promise<IbkrFlexSyncResult> {
  const connection = await claimConnection(userId, now);
  if (!connection) {
    return { status: 'busy', importedCount: 0, reportCount: 0, nextSyncAt: null };
  }

  try {
    const token = decryptFlexToken(connection.encryptedToken);
    const statement = await retrieveFlexStatement(token, connection.queryId, {
      onProgress: (event) => {
        if (event.stage === 'requesting') {
          onProgress?.({ stage: 'requesting', message: 'Requesting your report from IBKR…' });
        } else {
          onProgress?.({
            stage: 'waiting',
            message: 'Waiting for IBKR to build the report…',
            attempt: event.attempt,
          });
        }
      },
    });
    onProgress?.({ stage: 'parsing', message: 'Reading the downloaded report…' });
    const parsed = await detectAndParseBroker({
      content: statement,
      filename: statement.trimStart().startsWith('<') ? 'ibkr-flex.xml' : 'ibkr-flex.csv',
    });
    if (!parsed || parsed.brokerId !== 'ibkr') {
      throw new IbkrFlexApiError(
        'The Flex report is missing the required Trades execution fields.',
        'unsupported_report',
        true,
      );
    }

    const payload = buildJournalPayload(parsed.transactions);
    onProgress?.({
      stage: 'importing',
      message: 'Importing executions…',
      done: 0,
      total: payload.executions.length,
    });
    const journalResult = payload.executions.length > 0
      ? await pushJournal(userId, payload, (phase, done, total) => {
          if (phase === 'executions') {
            onProgress?.({ stage: 'importing', message: 'Importing executions…', done, total });
          } else {
            onProgress?.({ stage: 'building', message: 'Building trades…', done, total });
          }
        })
      : { adoptedExecutions: 0 };
    const nextSyncAt = nextDailyFlexSync(now, Number(process.env.IBKR_FLEX_DAILY_HOUR_ET ?? 6));
    const syncedAt = new Date().toISOString();

    await db
      .update(ibkrFlexConnection)
      .set({
        status: 'active',
        lastSyncedAt: syncedAt,
        nextSyncAt: nextSyncAt.toISOString(),
        lastImportedCount: journalResult.adoptedExecutions,
        totalImportedCount: sql`${ibkrFlexConnection.totalImportedCount} + ${journalResult.adoptedExecutions}`,
        lastReportCount: parsed.transactions.length,
        consecutiveFailures: 0,
        lastErrorCode: null,
        lastError: null,
        updatedAt: syncedAt,
      })
      .where(eq(ibkrFlexConnection.id, connection.id));

    return {
      status: 'success',
      importedCount: journalResult.adoptedExecutions,
      reportCount: parsed.transactions.length,
      nextSyncAt: nextSyncAt.toISOString(),
    };
  } catch (error) {
    const apiError = error instanceof IbkrFlexApiError ? error : null;
    const actionRequired = apiError?.actionRequired ?? false;
    const nextSyncAt = actionRequired
      ? nextDailyFlexSync(now, Number(process.env.IBKR_FLEX_DAILY_HOUR_ET ?? 6))
      : retryAt(now, connection.consecutiveFailures + 1);
    const safeMessage = apiError?.message ?? 'The IBKR Flex sync failed unexpectedly. Try again shortly.';
    const safeCode = apiError?.code ?? 'internal';

    await db
      .update(ibkrFlexConnection)
      .set({
        status: actionRequired ? 'action_required' : 'error',
        nextSyncAt: nextSyncAt.toISOString(),
        lastImportedCount: 0,
        consecutiveFailures: connection.consecutiveFailures + 1,
        lastErrorCode: safeCode,
        lastError: safeMessage,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(ibkrFlexConnection.id, connection.id));

    return {
      status: actionRequired ? 'action_required' : 'error',
      importedCount: 0,
      reportCount: 0,
      nextSyncAt: nextSyncAt.toISOString(),
      errorCode: safeCode,
      error: safeMessage,
    };
  }
}

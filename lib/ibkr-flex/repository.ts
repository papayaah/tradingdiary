import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/server';
import { ibkrFlexConnection } from '@/lib/db/server/schema';
import { encryptFlexToken } from './crypto';
import type { IbkrFlexConnectionView } from './types';

export async function getFlexConnection(userId: string) {
  const [connection] = await db
    .select()
    .from(ibkrFlexConnection)
    .where(eq(ibkrFlexConnection.userId, userId))
    .limit(1);
  return connection;
}

export function connectionView(
  connection: typeof ibkrFlexConnection.$inferSelect | undefined,
): IbkrFlexConnectionView | null {
  if (!connection) return null;
  return {
    connected: true,
    queryId: connection.queryId,
    tokenLastFour: connection.tokenLastFour,
    status: connection.status as IbkrFlexConnectionView['status'],
    lastSyncedAt: connection.lastSyncedAt,
    nextSyncAt: connection.nextSyncAt,
    lastAttemptAt: connection.lastAttemptAt,
    lastImportedCount: connection.lastImportedCount,
    totalImportedCount: connection.totalImportedCount,
    lastReportCount: connection.lastReportCount,
    lastErrorCode: connection.lastErrorCode,
    lastError: connection.lastError,
  };
}

export async function saveFlexConnection(userId: string, queryId: string, token: string) {
  const now = new Date().toISOString();
  const encryptedToken = encryptFlexToken(token);
  const [connection] = await db
    .insert(ibkrFlexConnection)
    .values({
      userId,
      queryId,
      encryptedToken,
      tokenLastFour: token.slice(-4),
      status: 'active',
      nextSyncAt: now,
      lastErrorCode: null,
      lastError: null,
      consecutiveFailures: 0,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: ibkrFlexConnection.userId,
      set: {
        queryId,
        encryptedToken,
        tokenLastFour: token.slice(-4),
        status: 'active',
        nextSyncAt: now,
        lastErrorCode: null,
        lastError: null,
        consecutiveFailures: 0,
        updatedAt: now,
      },
    })
    .returning();
  return connection;
}

export async function deleteFlexConnection(userId: string): Promise<boolean> {
  const deleted = await db
    .delete(ibkrFlexConnection)
    .where(eq(ibkrFlexConnection.userId, userId))
    .returning({ id: ibkrFlexConnection.id });
  return deleted.length > 0;
}

import { and, asc, inArray, lte } from 'drizzle-orm';
import { db } from '@/lib/db/server';
import { ibkrFlexConnection } from '@/lib/db/server/schema';
import { syncIbkrFlexConnection } from './sync';

export async function syncDueIbkrFlexConnections(now = new Date()): Promise<{
  due: number;
  synced: number;
  failed: number;
}> {
  const batchSize = Math.max(1, Number(process.env.IBKR_FLEX_SYNC_BATCH_SIZE ?? 10));
  const due = await db
    .select({ userId: ibkrFlexConnection.userId })
    .from(ibkrFlexConnection)
    .where(
      and(
        inArray(ibkrFlexConnection.status, ['active', 'error', 'syncing']),
        lte(ibkrFlexConnection.nextSyncAt, now.toISOString()),
      ),
    )
    .orderBy(asc(ibkrFlexConnection.nextSyncAt))
    .limit(batchSize);

  let synced = 0;
  let failed = 0;
  for (const connection of due) {
    const result = await syncIbkrFlexConnection(connection.userId, now);
    if (result.status === 'success') synced += 1;
    else if (result.status !== 'busy') failed += 1;

    if (result.status === 'action_required') {
      try {
        const { sendWebPushToUser } = await import('@/lib/scanner/push');
        await sendWebPushToUser(connection.userId, {
          symbol: 'IBKR',
          interval: 'Flex',
          matchedPattern: 'Connection',
          message: 'Your IBKR Flex connection needs attention. Regenerate the token or verify the Query ID.',
          url: '/media?view=import',
        });
      } catch (error) {
        console.error(
          '[scanner] IBKR Flex notification failed:',
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  return { due: due.length, synced, failed };
}

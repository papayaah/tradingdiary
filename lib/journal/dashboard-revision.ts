import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/server';
import { journalEvent } from '@/lib/db/server/schema';

const DASHBOARD_ENTITIES = ['account', 'execution', 'trade_group', 'cash_flow'];

/**
 * Monotonic version for data that can change dashboard output. This is cheaper
 * than rebuilding a date range merely to discover that nothing changed, and it
 * works across web/scanner processes because the revision lives in Postgres.
 */
export async function getDashboardRevision(userId: string): Promise<number> {
  const [latest] = await db
    .select({ seq: journalEvent.seq })
    .from(journalEvent)
    .where(and(
      eq(journalEvent.userId, userId),
      inArray(journalEvent.entity, DASHBOARD_ENTITIES),
    ))
    .orderBy(desc(journalEvent.seq))
    .limit(1);
  return latest?.seq ?? 0;
}

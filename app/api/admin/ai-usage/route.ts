import { NextResponse } from 'next/server';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { db } from '@/lib/db/server';
import { aiUsageEvent } from '@/lib/db/server/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const successful = and(
    gte(aiUsageEvent.createdAt, since),
    eq(aiUsageEvent.status, 'succeeded'),
  );

  const [summary] = await db
    .select({
      requests: sql<number>`count(*)`,
      credits: sql<number>`coalesce(sum(${aiUsageEvent.creditsCharged}), 0)`,
      uniqueUsers: sql<number>`count(distinct ${aiUsageEvent.userId})`,
      uniqueGuests: sql<number>`count(distinct case when ${aiUsageEvent.subjectType} = 'guest' then ${aiUsageEvent.subjectId} end)`,
    })
    .from(aiUsageEvent)
    .where(successful);

  // Provider spend can occur on a response that fails app validation. Those
  // requests are refunded to the user but still count toward real operator cost.
  const [providerUsage] = await db
    .select({
      inputTokens: sql<number>`coalesce(sum(${aiUsageEvent.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${aiUsageEvent.outputTokens}), 0)`,
      totalTokens: sql<number>`coalesce(sum(${aiUsageEvent.totalTokens}), 0)`,
      costUsd: sql<number>`coalesce(sum(${aiUsageEvent.costUsd}), 0)`,
    })
    .from(aiUsageEvent)
    .where(gte(aiUsageEvent.createdAt, since));

  const [failed] = await db
    .select({ count: sql<number>`count(*)` })
    .from(aiUsageEvent)
    .where(and(gte(aiUsageEvent.createdAt, since), eq(aiUsageEvent.status, 'failed')));

  const byAction = await db
    .select({
      action: aiUsageEvent.action,
      requests: sql<number>`count(*) filter (where ${aiUsageEvent.status} = 'succeeded')`,
      credits: sql<number>`coalesce(sum(${aiUsageEvent.creditsCharged}), 0)`,
      tokens: sql<number>`coalesce(sum(${aiUsageEvent.totalTokens}), 0)`,
      costUsd: sql<number>`coalesce(sum(${aiUsageEvent.costUsd}), 0)`,
    })
    .from(aiUsageEvent)
    .where(gte(aiUsageEvent.createdAt, since))
    .groupBy(aiUsageEvent.action)
    .orderBy(desc(sql`count(*)`));

  const trend = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${aiUsageEvent.createdAt}), 'YYYY-MM-DD')`,
      requests: sql<number>`count(*) filter (where ${aiUsageEvent.status} = 'succeeded')`,
      credits: sql<number>`coalesce(sum(${aiUsageEvent.creditsCharged}), 0)`,
      costUsd: sql<number>`coalesce(sum(${aiUsageEvent.costUsd}), 0)`,
    })
    .from(aiUsageEvent)
    .where(gte(aiUsageEvent.createdAt, since))
    .groupBy(sql`date_trunc('day', ${aiUsageEvent.createdAt})`)
    .orderBy(sql`date_trunc('day', ${aiUsageEvent.createdAt})`);

  return NextResponse.json({
    success: true,
    days,
    summary: {
      requests: Number(summary?.requests ?? 0),
      credits: Number(summary?.credits ?? 0),
      inputTokens: Number(providerUsage?.inputTokens ?? 0),
      outputTokens: Number(providerUsage?.outputTokens ?? 0),
      totalTokens: Number(providerUsage?.totalTokens ?? 0),
      costUsd: Number(providerUsage?.costUsd ?? 0),
      uniqueUsers: Number(summary?.uniqueUsers ?? 0),
      uniqueGuests: Number(summary?.uniqueGuests ?? 0),
      failedRequests: Number(failed?.count ?? 0),
    },
    byAction: byAction.map((row) => ({
      ...row,
      requests: Number(row.requests),
      credits: Number(row.credits),
      tokens: Number(row.tokens),
      costUsd: Number(row.costUsd),
    })),
    trend: trend.map((row) => ({
      ...row,
      requests: Number(row.requests),
      credits: Number(row.credits),
      costUsd: Number(row.costUsd),
    })),
  });
}

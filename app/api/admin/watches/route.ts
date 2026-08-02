import { NextResponse } from 'next/server';
import { db } from '@/lib/scanner/db';
import { serverWatch } from '@/lib/db/server/schema';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { count, eq, sql, desc } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Asset Class distribution
    const assetClassRows = await db
      .select({
        assetClass: serverWatch.assetClass,
        watchCount: count(),
        uniqueSymbols: sql<number>`count(distinct ${serverWatch.symbol})`,
      })
      .from(serverWatch)
      .where(eq(serverWatch.enabled, true))
      .groupBy(serverWatch.assetClass);

    // Interval distribution
    const intervalRows = await db
      .select({
        interval: serverWatch.interval,
        count: count(),
      })
      .from(serverWatch)
      .where(eq(serverWatch.enabled, true))
      .groupBy(serverWatch.interval);

    // Top watched symbols across users
    const topSymbolsRows = await db
      .select({
        symbol: serverWatch.symbol,
        assetClass: serverWatch.assetClass,
        watcherCount: sql<number>`count(distinct ${serverWatch.userId})`,
        totalWatches: count(),
      })
      .from(serverWatch)
      .where(eq(serverWatch.enabled, true))
      .groupBy(serverWatch.symbol, serverWatch.assetClass)
      .orderBy(desc(sql`count(distinct ${serverWatch.userId})`))
      .limit(15);

    return NextResponse.json({
      success: true,
      assetClasses: assetClassRows.map((r) => ({
        assetClass: r.assetClass,
        watchCount: Number(r.watchCount),
        uniqueSymbols: Number(r.uniqueSymbols),
      })),
      intervals: intervalRows.map((r) => ({
        interval: r.interval,
        count: Number(r.count),
      })),
      topSymbols: topSymbolsRows.map((r) => ({
        symbol: r.symbol,
        assetClass: r.assetClass,
        watcherCount: Number(r.watcherCount),
        totalWatches: Number(r.totalWatches),
        overlapMultiplier: Number(r.watcherCount) > 0 ? Number((Number(r.totalWatches) / Number(r.watcherCount)).toFixed(2)) : 1,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch watch metrics' },
      { status: 500 }
    );
  }
}

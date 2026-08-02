import { NextResponse } from 'next/server';
import { db } from '@/lib/scanner/db';
import { serverWatchAlert } from '@/lib/db/server/schema';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { count, sql, desc, gte } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const days = Math.min(90, Math.max(7, Number(url.searchParams.get('days')) || 30));
    const agoDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // 1. Alerts trend by day
    const trendRows = await db
      .select({
        day: sql<string>`to_char(${serverWatchAlert.createdAt}, 'YYYY-MM-DD')`,
        count: count(),
      })
      .from(serverWatchAlert)
      .where(gte(serverWatchAlert.createdAt, agoDate))
      .groupBy(sql`to_char(${serverWatchAlert.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${serverWatchAlert.createdAt}, 'YYYY-MM-DD')`);

    // 2. Breakdown by Direction (bullish vs bearish)
    const directionRows = await db
      .select({
        direction: serverWatchAlert.direction,
        count: count(),
      })
      .from(serverWatchAlert)
      .where(gte(serverWatchAlert.createdAt, agoDate))
      .groupBy(serverWatchAlert.direction);

    // 3. Breakdown by Pattern ID
    const patternRows = await db
      .select({
        patternId: serverWatchAlert.patternId,
        count: count(),
      })
      .from(serverWatchAlert)
      .where(gte(serverWatchAlert.createdAt, agoDate))
      .groupBy(serverWatchAlert.patternId);

    // 4. Top Alerted Symbols
    const topSymbolRows = await db
      .select({
        symbol: serverWatchAlert.symbol,
        count: count(),
      })
      .from(serverWatchAlert)
      .where(gte(serverWatchAlert.createdAt, agoDate))
      .groupBy(serverWatchAlert.symbol)
      .orderBy(desc(count()))
      .limit(10);

    return NextResponse.json({
      success: true,
      days,
      trend: trendRows.map((r) => ({ day: r.day, count: Number(r.count) })),
      byDirection: directionRows.map((r) => ({ direction: r.direction, count: Number(r.count) })),
      byPattern: patternRows.map((r) => ({ patternId: r.patternId, count: Number(r.count) })),
      topSymbols: topSymbolRows.map((r) => ({ symbol: r.symbol, count: Number(r.count) })),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch alert metrics' },
      { status: 500 }
    );
  }
}

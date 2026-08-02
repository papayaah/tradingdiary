import { NextResponse } from 'next/server';
import { db } from '@/lib/scanner/db';
import { user, session, serverWatch, serverWatchAlert, scannerHeartbeat, providerRequestStats } from '@/lib/db/server/schema';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { count, eq, sql, gte, and } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const userSession = await auth.api.getSession({ headers: request.headers });
    if (!userSession?.user || !isAdminEmail(userSession.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const now = new Date();
    const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfTodayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayStr = now.toISOString().slice(0, 10);

    // 1. User metrics
    const [totalUsersRow] = await db.select({ count: count() }).from(user);
    const totalUsers = Number(totalUsersRow?.count ?? 0);

    const [active24hRow] = await db
      .select({ count: sql<number>`count(distinct ${session.userId})` })
      .from(session)
      .where(gte(session.updatedAt, ago24h));
    const activeUsers24h = Number(active24hRow?.count ?? 0);

    const [active7dRow] = await db
      .select({ count: sql<number>`count(distinct ${session.userId})` })
      .from(session)
      .where(gte(session.updatedAt, ago7d));
    const activeUsers7d = Number(active7dRow?.count ?? 0);

    const [activatedUsersRow] = await db
      .select({ count: sql<number>`count(distinct ${serverWatch.userId})` })
      .from(serverWatch)
      .where(eq(serverWatch.enabled, true));
    const activatedUsers = Number(activatedUsersRow?.count ?? 0);

    // 2. Watch metrics
    const [totalWatchesRow] = await db.select({ count: count() }).from(serverWatch);
    const totalWatches = Number(totalWatchesRow?.count ?? 0);

    const [enabledWatchesRow] = await db
      .select({ count: count() })
      .from(serverWatch)
      .where(eq(serverWatch.enabled, true));
    const enabledWatches = Number(enabledWatchesRow?.count ?? 0);
    const disabledWatches = Math.max(0, totalWatches - enabledWatches);

    const [uniqueSymbolsRow] = await db
      .select({ count: sql<number>`count(distinct ${serverWatch.symbol})` })
      .from(serverWatch)
      .where(eq(serverWatch.enabled, true));
    const uniqueSymbols = Number(uniqueSymbolsRow?.count ?? 0);

    const sharingRatio = uniqueSymbols > 0 ? Number((enabledWatches / uniqueSymbols).toFixed(2)) : 1.0;

    // 3. Upstream & Alerts Today
    const [providerRequestsRow] = await db
      .select({ sum: sql<number>`coalesce(sum(${providerRequestStats.count}), 0)` })
      .from(providerRequestStats)
      .where(eq(providerRequestStats.day, todayStr));
    const upstreamRequestsToday = Number(providerRequestsRow?.sum ?? 0);

    const [alertsTodayRow] = await db
      .select({ count: count() })
      .from(serverWatchAlert)
      .where(gte(serverWatchAlert.createdAt, startOfTodayIso));
    const alertsToday = Number(alertsTodayRow?.count ?? 0);

    // 4. Scanner Liveness
    const heartbeats = await db.select().from(scannerHeartbeat);
    let scannerStatus: 'healthy' | 'stale' | 'offline' = 'offline';
    let newestBeatTime: Date | null = null;

    if (heartbeats.length > 0) {
      for (const hb of heartbeats) {
        const beatDate = new Date(hb.lastBeatAt);
        if (!newestBeatTime || beatDate > newestBeatTime) {
          newestBeatTime = beatDate;
        }
      }
      if (newestBeatTime) {
        const diffMs = now.getTime() - newestBeatTime.getTime();
        scannerStatus = diffMs <= 2 * 60 * 1000 ? 'healthy' : 'stale';
      }
    }

    return NextResponse.json({
      success: true,
      users: {
        total: totalUsers,
        active24h: activeUsers24h,
        active7d: activeUsers7d,
        activated: activatedUsers,
      },
      watches: {
        total: totalWatches,
        enabled: enabledWatches,
        disabled: disabledWatches,
        uniqueSymbols,
        sharingRatio,
      },
      activity: {
        upstreamRequestsToday,
        alertsToday,
      },
      scanner: {
        status: scannerStatus,
        workerCount: heartbeats.length,
        lastBeatAt: newestBeatTime ? newestBeatTime.toISOString() : null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch admin overview' },
      { status: 500 }
    );
  }
}

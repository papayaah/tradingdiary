import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { getProviderBudget } from '@/lib/scanner/shared/provider-budget';
import IORedis from 'ioredis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
    await redis.connect().catch(() => {});

    const scopes = [
      'tiingo:server',
      'polygon-io:server',
      'ibkr-cme:server',
      'yahoo-finance:server',
    ];
    const governorStates: Array<{
      providerScope: string;
      cadenceSeconds: number;
      uniqueKeys: number;
      bindingTerm: string;
      predictedReqPerHour: number;
      updatedAt: string | null;
      dailyCap: number;
      floorSeconds: number;
    }> = [];

    if (redis.status === 'ready') {
      try {
        for (const scope of scopes) {
          const budget = getProviderBudget(scope);
          const hash = await redis.hgetall(`metrics:governor:${scope}`);

          if (hash && hash.providerScope) {
            governorStates.push({
              providerScope: scope,
              cadenceSeconds: Number(hash.cadenceSeconds || budget.floorSeconds),
              uniqueKeys: Number(hash.uniqueKeys || 0),
              bindingTerm: hash.bindingTerm || 'floor',
              predictedReqPerHour: Number(hash.predictedReqPerHour || 0),
              updatedAt: hash.updatedAt || null,
              dailyCap: budget.dailyCap,
              floorSeconds: budget.floorSeconds,
            });
          } else {
            // Default inactive governor state for scope
            governorStates.push({
              providerScope: scope,
              cadenceSeconds: budget.floorSeconds,
              uniqueKeys: 0,
              bindingTerm: 'idle',
              predictedReqPerHour: 0,
              updatedAt: null,
              dailyCap: budget.dailyCap,
              floorSeconds: budget.floorSeconds,
            });
          }
        }
      } catch {
        // Fallback
      }
      await redis.quit().catch(() => {});
    }

    return NextResponse.json({
      success: true,
      governor: governorStates,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch governor metrics' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
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

    let hits = 0;
    let misses = 0;
    let waiters = 0;
    let upstream = 0;
    let errors = 0;
    let snapshotCount = 0;

    if (redis.status === 'ready') {
      try {
        const metricKeys = await redis.keys('metrics:cache:*');
        for (const key of metricKeys) {
          const val = parseInt((await redis.get(key)) || '0', 10);
          if (key.endsWith(':hits')) hits += val;
          else if (key.endsWith(':misses')) misses += val;
          else if (key.endsWith(':waiters')) waiters += val;
          else if (key.endsWith(':upstream')) upstream += val;
          else if (key.endsWith(':errors')) errors += val;
        }

        const snapshotKeys = await redis.keys('market-data:snapshot:*');
        snapshotCount = snapshotKeys.length;
      } catch {
        // Fallback to defaults
      }
      await redis.quit().catch(() => {});
    }

    const totalEvaluations = hits + misses;
    const hitRatePct = totalEvaluations > 0 ? Number(((hits / totalEvaluations) * 100).toFixed(1)) : 0;

    return NextResponse.json({
      success: true,
      cache: {
        hits,
        misses,
        waiters,
        upstream,
        errors,
        hitRatePct,
        snapshotCount,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch cache metrics' },
      { status: 500 }
    );
  }
}

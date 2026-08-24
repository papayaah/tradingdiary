import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { getProviderBudget } from '@/lib/scanner/shared/provider-budget';
import { assetClassFromCadence, entitlementScopeFromCadence } from '@/lib/scanner/shared/provider-scope';
import { readScannerControl } from '@/lib/scanner/control';
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

    const { cadenceOverrides } = await readScannerControl();
    const governorStates: Array<{
      providerScope: string; // the per-class cadence scope, e.g. "tiingo:crypto:server"
      entitlementScope: string;
      assetClass: string;
      cadenceSeconds: number;
      uniqueKeys: number;
      bindingTerm: string;
      predictedReqPerHour: number;
      updatedAt: string | null;
      dailyCap: number;
      floorSeconds: number;
      overrideSeconds: number | null;
    }> = [];

    if (redis.status === 'ready') {
      try {
        // Cadence scopes are dynamic (provider×class); enumerate whatever the
        // scanner's recompute has published rather than a fixed list.
        const keys = await redis.keys('metrics:governor:*');
        // Surface a row for any scope that has a pending manual override even if
        // its metrics hash has not been written yet (e.g. class currently idle).
        // Only per-class cadence scopes (provider×class) are valid; drop any
        // pre-refactor provider-only keys (e.g. "tiingo:server") that linger in
        // Redis but the scanner no longer updates.
        const scopes = [...new Set<string>([
          ...keys.map((k) => k.replace(/^metrics:governor:/, '')),
          ...Object.keys(cadenceOverrides),
        ])].filter((scope) => assetClassFromCadence(scope) !== undefined);

        for (const scope of scopes) {
          const entitlementScope = entitlementScopeFromCadence(scope);
          const budget = getProviderBudget(entitlementScope);
          const hash = await redis.hgetall(`metrics:governor:${scope}`);
          const overrideSeconds = cadenceOverrides[scope] ?? null;

          if (hash && hash.providerScope) {
            governorStates.push({
              providerScope: scope,
              entitlementScope: hash.entitlementScope || entitlementScope,
              assetClass: hash.assetClass || assetClassFromCadence(scope) || '',
              cadenceSeconds: Number(hash.cadenceSeconds || budget.floorSeconds),
              uniqueKeys: Number(hash.uniqueKeys || 0),
              bindingTerm: hash.bindingTerm || 'floor',
              predictedReqPerHour: Number(hash.predictedReqPerHour || 0),
              updatedAt: hash.updatedAt || null,
              dailyCap: budget.dailyCap,
              floorSeconds: budget.floorSeconds,
              overrideSeconds,
            });
          } else {
            // Override set but no metrics yet: show an idle row so it's editable.
            governorStates.push({
              providerScope: scope,
              entitlementScope,
              assetClass: assetClassFromCadence(scope) || '',
              cadenceSeconds: overrideSeconds ?? budget.floorSeconds,
              uniqueKeys: 0,
              bindingTerm: overrideSeconds ? 'manual' : 'idle',
              predictedReqPerHour: 0,
              updatedAt: null,
              dailyCap: budget.dailyCap,
              floorSeconds: budget.floorSeconds,
              overrideSeconds,
            });
          }
        }
        governorStates.sort((a, b) => a.providerScope.localeCompare(b.providerScope));
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

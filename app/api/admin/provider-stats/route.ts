import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { getProviderStats } from '@/lib/metrics/provider-usage';
import { getProviderBudget } from '@/lib/scanner/shared/provider-budget';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 30));
  const stats = await getProviderStats(days);

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const hourFraction = Math.max(0.1, currentHour / 24);

  // Group by provider for today
  const providerSummary: Record<
    string,
    {
      todayCount: number;
      projectedDaily: number;
      dailyCap: number;
      hourlyCap: number;
      utilizationPct: number;
    }
  > = {};

  const knownScopes = [
    'tiingo:server',
    'polygon-io:server',
    'ibkr-cme:server',
    'yahoo-finance:server',
  ] as const;
  for (const scope of knownScopes) {
    const budget = getProviderBudget(scope);
    const expectedProviders: Record<(typeof knownScopes)[number], readonly string[]> = {
      'tiingo:server': ['tiingo', 'tiingo crypto'],
      'polygon-io:server': ['polygon.io'],
      'ibkr-cme:server': ['ibkr (cme)'],
      'yahoo-finance:server': ['yahoo finance'],
    };

    const todayRows = stats.filter((s) => {
      return s.day === todayStr
        && s.keyOwner === 'owner'
        && expectedProviders[scope].includes(s.provider.trim().toLowerCase());
    });

    const todayCount = todayRows.reduce((acc, r) => acc + r.count, 0);
    const projectedDaily = Math.round(todayCount / hourFraction);
    const utilizationPct = budget.dailyCap > 0 ? Math.min(100, Math.round((todayCount / budget.dailyCap) * 100)) : 0;

    providerSummary[scope] = {
      todayCount,
      projectedDaily,
      dailyCap: budget.dailyCap,
      hourlyCap: budget.hourlyCap,
      utilizationPct,
    };
  }

  return NextResponse.json({
    success: true,
    days,
    stats,
    summary: providerSummary,
  });
}

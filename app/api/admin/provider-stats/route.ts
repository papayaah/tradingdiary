import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { getProviderStats } from '@/lib/metrics/provider-usage';

// Node runtime (Postgres access) + always dynamic (per-request auth).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Admin-only: this exposes the owner's outbound provider request volume.
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 30));
  const stats = await getProviderStats(days);
  return NextResponse.json({ days, stats });
}

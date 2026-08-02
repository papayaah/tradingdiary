import { NextResponse } from 'next/server';
import { db } from '@/lib/scanner/db';
import { user } from '@/lib/db/server/schema';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { sql, gte, desc } from 'drizzle-orm';

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
    const agoDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const signupRows = await db
      .select({
        day: sql<string>`to_char(${user.createdAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)`,
      })
      .from(user)
      .where(gte(user.createdAt, agoDate))
      .groupBy(sql`to_char(${user.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${user.createdAt}, 'YYYY-MM-DD')`);

    return NextResponse.json({
      success: true,
      days,
      signups: signupRows.map((r) => ({
        day: r.day,
        count: Number(r.count),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch user metrics' },
      { status: 500 }
    );
  }
}

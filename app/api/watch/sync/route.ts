import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/server';
import { userWatchlists } from '@/lib/db/server/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const records = await db
      .select()
      .from(userWatchlists)
      .where(eq(userWatchlists.userId, session.user.id))
      .limit(1);

    if (records.length === 0) {
      return NextResponse.json({ watchlist: null });
    }

    return NextResponse.json({ watchlist: records[0].watchlist });
  } catch (error) {
    console.error('Failed to fetch user watchlist from DB:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const watchlist = body.watchlist;
    if (!Array.isArray(watchlist)) {
      return NextResponse.json({ error: 'Invalid watchlist format' }, { status: 400 });
    }

    const existing = await db
      .select()
      .from(userWatchlists)
      .where(eq(userWatchlists.userId, session.user.id))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(userWatchlists)
        .set({ watchlist, updatedAt: new Date().toISOString() })
        .where(eq(userWatchlists.userId, session.user.id));
    } else {
      await db.insert(userWatchlists).values({
        userId: session.user.id,
        watchlist,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to sync watchlist to DB:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

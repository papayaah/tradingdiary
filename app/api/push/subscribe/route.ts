import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/server';
import { userPushSubscription } from '@/lib/db/server/schema';
import { auth } from '@/lib/auth';
import { eq, and } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ authenticated: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { subscription } = await request.json();
    if (!subscription?.endpoint || !subscription?.keys) {
      return NextResponse.json({ error: 'Invalid subscription payload' }, { status: 400 });
    }

    const userAgent = request.headers.get('user-agent') || 'Unknown';

    await db
      .insert(userPushSubscription)
      .values({
        userId: session.user.id,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userAgent,
      })
      .onConflictDoUpdate({
        target: userPushSubscription.endpoint,
        set: {
          userId: session.user.id,
          keys: subscription.keys,
          userAgent,
        },
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[push/subscribe] error:', error);
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ authenticated: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { endpoint } = await request.json();
    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint required' }, { status: 400 });
    }

    await db
      .delete(userPushSubscription)
      .where(and(eq(userPushSubscription.userId, session.user.id), eq(userPushSubscription.endpoint, endpoint)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[push/subscribe] delete error:', error);
    return NextResponse.json({ error: 'Failed to delete subscription' }, { status: 500 });
  }
}

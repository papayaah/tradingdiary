import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { getSubscriberInfo } from '@/lib/watch/events-bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user || !isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const info = getSubscriberInfo();

    return NextResponse.json({
      success: true,
      activeConnections: info.activeConnections,
      distinctUsers: info.distinctUsers,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch live presence' },
      { status: 500 }
    );
  }
}

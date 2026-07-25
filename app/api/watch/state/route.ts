import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildSnapshot } from '@/lib/watch/snapshot';

// Holds a request-scoped DB read; must run in the Node.js runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  try {
    const snapshot = await buildSnapshot(session.user.id);
    return NextResponse.json(snapshot, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (error) {
    console.error('watch/state snapshot error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

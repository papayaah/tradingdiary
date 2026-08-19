import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectionView, getFlexConnection } from '@/lib/ibkr-flex/repository';
import { syncIbkrFlexConnection } from '@/lib/ibkr-flex/sync';

const MANUAL_COOLDOWN_MS = 60_000;

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const connection = await getFlexConnection(session.user.id);
  if (!connection) return NextResponse.json({ error: 'Connect IBKR Flex first.' }, { status: 404 });
  if (connection.status === 'syncing') {
    return NextResponse.json({ error: 'An IBKR Flex sync is already running.' }, { status: 409 });
  }
  if (
    connection.lastAttemptAt &&
    Date.now() - Date.parse(connection.lastAttemptAt) < MANUAL_COOLDOWN_MS
  ) {
    return NextResponse.json(
      { error: 'Please wait one minute before syncing again.' },
      { status: 429 },
    );
  }

  const sync = await syncIbkrFlexConnection(session.user.id);
  const updated = await getFlexConnection(session.user.id);
  const status = sync.status === 'success' ? 200 : sync.status === 'busy' ? 409 : 422;
  return NextResponse.json({ connection: connectionView(updated), sync }, { status });
}

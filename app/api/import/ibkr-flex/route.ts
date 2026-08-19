import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  connectionView,
  deleteFlexConnection,
  getFlexConnection,
  saveFlexConnection,
} from '@/lib/ibkr-flex/repository';
import { syncIbkrFlexConnection } from '@/lib/ibkr-flex/sync';
import { normalizeFlexQueryId, normalizeFlexToken } from '@/lib/ibkr-flex/validation';

const CONNECTION_ATTEMPT_COOLDOWN_MS = 30_000;

async function authenticatedUserId(request: NextRequest): Promise<string | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user?.id ?? null;
}

export async function GET(request: NextRequest) {
  const userId = await authenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const connection = await getFlexConnection(userId);
  return NextResponse.json(connectionView(connection), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: NextRequest) {
  const userId = await authenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  try {
    const body = await request.json();
    const queryId = normalizeFlexQueryId(body.queryId);
    const token = normalizeFlexToken(body.token);
    const current = await getFlexConnection(userId);
    if (
      current?.lastAttemptAt &&
      Date.now() - Date.parse(current.lastAttemptAt) < CONNECTION_ATTEMPT_COOLDOWN_MS
    ) {
      return NextResponse.json(
        { error: 'Please wait 30 seconds before testing the connection again.' },
        { status: 429 },
      );
    }
    await saveFlexConnection(userId, queryId, token);
    const sync = await syncIbkrFlexConnection(userId);
    const connection = await getFlexConnection(userId);
    const status = sync.status === 'success' ? 200 : sync.status === 'busy' ? 409 : 422;
    return NextResponse.json({ connection: connectionView(connection), sync }, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save the IBKR Flex connection.';
    const status = message.includes('IBKR_FLEX_ENCRYPTION_KEY') ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  const userId = await authenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  await deleteFlexConnection(userId);
  return NextResponse.json({ disconnected: true });
}

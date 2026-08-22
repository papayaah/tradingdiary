import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectionView, getFlexConnection } from '@/lib/ibkr-flex/repository';
import { syncIbkrFlexConnection } from '@/lib/ibkr-flex/sync';
import type { IbkrFlexSyncStreamEvent } from '@/lib/ibkr-flex/types';

const MANUAL_COOLDOWN_MS = 60_000;

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  const userId = session.user.id;

  const connection = await getFlexConnection(userId);
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

  // Stream progress as newline-delimited JSON so the UI can show live stages
  // (the import of a full 365-day report takes a while). A single trailing
  // `result` event carries the final connection view and sync outcome.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: IbkrFlexSyncStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const sync = await syncIbkrFlexConnection(userId, new Date(), (progress) => {
          send({ type: 'progress', progress });
        });
        const updated = await getFlexConnection(userId);
        send({ type: 'result', connection: connectionView(updated), sync });
      } catch (error) {
        send({
          type: 'result',
          error: error instanceof Error ? error.message : 'The sync could not complete.',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}

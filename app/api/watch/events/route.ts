import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { subscribe, getEventsAfter, type WatchEventRow } from '@/lib/watch/events-bridge';

// Long-lived SSE stream + a persistent LISTEN bridge: Node.js runtime only.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 20_000;
const REVALIDATE_MS = 60_000;
const MAX_LIFETIME_MS = 20 * 60_000; // force reconnect + fresh auth every 20 min

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  const userId = session.user.id;

  // Resume point: SSE reconnects send Last-Event-ID; a fresh open may pass ?cursor=.
  const url = new URL(request.url);
  const resume = request.headers.get('last-event-id') ?? url.searchParams.get('cursor');
  const startCursor = Number(resume);
  let cursor = Number.isFinite(startCursor) && startCursor > 0 ? startCursor : 0;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const timers: NodeJS.Timeout[] = [];
      let unsub: (() => void) | null = null;

      const enqueue = (chunk: string): boolean => {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(chunk));
          return true;
        } catch {
          cleanup();
          return false;
        }
      };

      const sendEvent = (e: WatchEventRow) => {
        if (e.seq <= cursor) return; // already delivered (dedup vs catch-up)
        const envelope = {
          seq: e.seq,
          id: e.id,
          type: e.type,
          payload: e.payload,
        };
        if (enqueue(`id: ${e.seq}\ndata: ${JSON.stringify(envelope)}\n\n`)) {
          cursor = e.seq;
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        timers.forEach(clearTimeout);
        if (unsub) unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // Buffer live events that arrive during catch-up, then flush in order.
      let ready = false;
      const buffer: WatchEventRow[] = [];
      unsub = subscribe(userId, (e) => {
        if (ready) sendEvent(e);
        else buffer.push(e);
      });

      // Open comment so proxies flush headers immediately.
      enqueue(`: connected\n\n`);

      // Durable catch-up from the cursor.
      try {
        const missed = await getEventsAfter(userId, cursor);
        for (const e of missed) sendEvent(e);
      } catch (err) {
        console.error('watch/events catch-up error:', err instanceof Error ? err.message : err);
      }

      // Flush anything buffered during catch-up (sendEvent dedups by seq).
      ready = true;
      buffer.sort((a, b) => a.seq - b.seq);
      for (const e of buffer) sendEvent(e);
      buffer.length = 0;

      // Heartbeat: the `: ping` comment keeps proxies from timing out but is
      // invisible to EventSource. A parseable heartbeat event alongside it lets
      // the client detect a silently dead stream. It carries no `id:`, so it
      // never advances the client cursor.
      timers.push(
        setInterval(() => {
          enqueue(`: ping\n\n`);
          enqueue(`data: ${JSON.stringify({ type: 'stream.heartbeat', payload: { t: Date.now() } })}\n\n`);
        }, HEARTBEAT_MS) as unknown as NodeJS.Timeout,
      );

      // Periodic session revalidation: close immediately if revoked/expired.
      timers.push(
        setInterval(async () => {
          const s = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          if (!s?.user || s.user.id !== userId) {
            enqueue(`event: auth.expired\ndata: {}\n\n`);
            cleanup();
          }
        }, REVALIDATE_MS) as unknown as NodeJS.Timeout,
      );

      // Bounded lifetime: end the stream so the client reconnects and re-auths.
      timers.push(setTimeout(cleanup, MAX_LIFETIME_MS));

      // Client disconnect.
      request.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable proxy buffering for SSE
    },
  });
}

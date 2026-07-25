// Web-process bridge between the scanner's PostgreSQL NOTIFY and connected SSE
// clients. A single dedicated LISTEN connection receives compact event ids,
// loads the durable event row, and fans it out to subscribers that own it.
//
// NOTIFY is only a wakeup: the durable row is the source of truth, and clients
// recover missed signals via the cursor (see getEventsAfter). Runs in the
// Node.js runtime (not edge) because it holds a long-lived PG connection.

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, asc, eq, gt } from 'drizzle-orm';
import * as schema from '@/lib/db/server/schema';
import { watchEvent } from '@/lib/db/server/schema';

export interface WatchEventRow {
  seq: number;
  id: string;
  userId: string;
  type: string;
  payload: unknown;
}

type Subscriber = { userId: string; push: (e: WatchEventRow) => void };

const connectionString =
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tradingdiary';

// Dedicated client: one connection is held by LISTEN, others serve row lookups,
// so this never contends with the app's request-scoped (max: 1) client.
const client = postgres(connectionString, { max: 3 });
const bridgeDb = drizzle(client, { schema });

const subscribers = new Set<Subscriber>();
let listening = false;

async function ensureListening(): Promise<void> {
  if (listening) return;
  listening = true;
  try {
    await client.listen('watch_events', (payload: string) => {
      void deliver(payload);
    });
  } catch (err) {
    listening = false;
    console.error('[events-bridge] failed to LISTEN:', err instanceof Error ? err.message : err);
  }
}

async function deliver(eventId: string): Promise<void> {
  if (subscribers.size === 0) return;
  try {
    const [row] = await bridgeDb
      .select()
      .from(watchEvent)
      .where(eq(watchEvent.id, eventId))
      .limit(1);
    if (!row) return;
    const event: WatchEventRow = {
      seq: row.seq,
      id: row.id,
      userId: row.userId,
      type: row.type,
      payload: row.payload,
    };
    for (const sub of subscribers) {
      if (sub.userId === event.userId) {
        try {
          sub.push(event);
        } catch {
          // A failed push (closed stream) is cleaned up by its own unsubscribe.
        }
      }
    }
  } catch (err) {
    console.error('[events-bridge] deliver error:', err instanceof Error ? err.message : err);
  }
}

/** Subscribe to live events for one user. Returns an unsubscribe function. */
export function subscribe(userId: string, push: (e: WatchEventRow) => void): () => void {
  void ensureListening();
  const sub: Subscriber = { userId, push };
  subscribers.add(sub);
  return () => {
    subscribers.delete(sub);
  };
}

/** Durable catch-up: events for a user strictly after the given seq cursor. */
export async function getEventsAfter(userId: string, cursor: number, limit = 500): Promise<WatchEventRow[]> {
  const rows = await bridgeDb
    .select()
    .from(watchEvent)
    .where(and(eq(watchEvent.userId, userId), gt(watchEvent.seq, cursor)))
    .orderBy(asc(watchEvent.seq))
    .limit(limit);
  return rows.map((r) => ({ seq: r.seq, id: r.id, userId: r.userId, type: r.type, payload: r.payload }));
}

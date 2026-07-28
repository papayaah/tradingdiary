// Server-side tracking of outbound market-data provider requests (Yahoo,
// Tiingo, Polygon, Databento, ...). Every provider request in this app is made
// server-side (the browser only ever calls same-origin /api/* routes), so this
// captures the true outbound load against the owner's IP and API quotas.
//
// key_owner distinguishes requests made with the owner's env API key ('owner' —
// these cost the owner) from those made with a user-supplied key from cookies
// ('user' — the user's own quota). Yahoo has no key and is recorded as 'owner'
// since the request still originates from the owner's server.
//
// Storage is Postgres (not Redis): the web service has no REDIS_URL in
// production, but both the web app and the scanner worker have DATABASE_URL. The
// table self-initializes on first write, so no migration step is needed.

import postgres from 'postgres';

export type KeyOwner = 'owner' | 'user';

export interface ProviderUsageRow {
  day: string; // YYYY-MM-DD (UTC bucket)
  provider: string;
  keyOwner: KeyOwner;
  count: number;
}

const connectionString = process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres> | null = null;
let ensured: Promise<void> | null = null;

function client(): ReturnType<typeof postgres> | null {
  if (sql) return sql;
  if (!connectionString) return null;
  // Small dedicated pool so this never contends with the app's request-scoped
  // or the scanner's pools.
  sql = postgres(connectionString, { max: 2, idle_timeout: 20 });
  return sql;
}

function ensureTable(db: ReturnType<typeof postgres>): Promise<void> {
  if (!ensured) {
    ensured = db`
      CREATE TABLE IF NOT EXISTS provider_request_stats (
        day date NOT NULL,
        provider text NOT NULL,
        key_owner text NOT NULL,
        count integer NOT NULL DEFAULT 0,
        PRIMARY KEY (day, provider, key_owner)
      )
    `.then(() => undefined);
  }
  return ensured;
}

function utcDay(offsetDays = 0): string {
  return new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Record one outbound provider request. Fire-and-forget safe: never throws, so a
 * metrics failure can never break the request it is measuring.
 */
export async function recordProviderRequest(provider: string, keyOwner: KeyOwner): Promise<void> {
  const db = client();
  if (!db) return;
  try {
    await ensureTable(db);
    const day = utcDay();
    await db`
      INSERT INTO provider_request_stats (day, provider, key_owner, count)
      VALUES (${day}, ${provider}, ${keyOwner}, 1)
      ON CONFLICT (day, provider, key_owner)
      DO UPDATE SET count = provider_request_stats.count + 1
    `;
  } catch {
    // Intentionally swallowed — metrics must never affect the real request.
  }
}

/** Daily rows for the last `days` days (UTC buckets), newest first. Admin read. */
export async function getProviderStats(days = 30): Promise<ProviderUsageRow[]> {
  const db = client();
  if (!db) return [];
  try {
    await ensureTable(db);
    const cutoff = utcDay(days);
    const rows = await db<Array<{ day: Date; provider: string; key_owner: string; count: number }>>`
      SELECT day, provider, key_owner, count
      FROM provider_request_stats
      WHERE day >= ${cutoff}::date
      ORDER BY day DESC, provider ASC
    `;
    return rows.map((r) => ({
      day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
      provider: r.provider,
      keyOwner: r.key_owner === 'user' ? 'user' : 'owner',
      count: Number(r.count),
    }));
  } catch {
    return [];
  }
}

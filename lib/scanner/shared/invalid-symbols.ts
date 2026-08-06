// Permanent database table (`invalid_symbols`) for invalid / non-existent ticker symbols (e.g. 404s).
// Ensures bad symbols entered by users are permanently blocked from wasting API calls
// and server resources across all scheduler runs.

import postgres from 'postgres';

export interface InvalidSymbolRecord {
  symbol: string;
  reason: string;
  provider?: string | null;
  createdAt: string;
}

const connectionString = process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres> | null = null;
let tableEnsured: Promise<void> | null = null;
const memoryBlacklist = new Set<string>();
let isLoadedFromDb = false;

function client(): ReturnType<typeof postgres> | null {
  if (sql) return sql;
  if (!connectionString) return null;
  sql = postgres(connectionString, { max: 2, idle_timeout: 20 });
  return sql;
}

function ensureTable(db: ReturnType<typeof postgres>): Promise<void> {
  if (!tableEnsured) {
    tableEnsured = db`
      CREATE TABLE IF NOT EXISTS invalid_symbols (
        symbol text PRIMARY KEY,
        reason text NOT NULL,
        provider text,
        created_at timestamp NOT NULL DEFAULT NOW()
      )
    `.then(() => undefined);
  }
  return tableEnsured;
}

/** Pre-load invalid symbols into memory for 0ms lookup performance. */
async function loadBlacklistCache(): Promise<void> {
  if (isLoadedFromDb) return;
  const db = client();
  if (!db) return;
  try {
    await ensureTable(db);
    const rows = await db<Array<{ symbol: string }>>`
      SELECT symbol FROM invalid_symbols
    `;
    for (const r of rows) {
      memoryBlacklist.add(r.symbol.trim().toUpperCase());
    }
    isLoadedFromDb = true;
  } catch {
    // Best-effort
  }
}

/** Synchronous fast check against in-memory blacklist cache. */
export function isSymbolBlacklistedSync(symbol: string): boolean {
  if (!symbol) return false;
  return memoryBlacklist.has(symbol.trim().toUpperCase());
}

/** Check if a symbol is permanently blacklisted. */
export async function isSymbolBlacklisted(symbol: string): Promise<boolean> {
  if (!symbol) return false;
  const cleanSymbol = symbol.trim().toUpperCase();
  if (memoryBlacklist.has(cleanSymbol)) return true;
  await loadBlacklistCache();
  return memoryBlacklist.has(cleanSymbol);
}

/** Add a symbol to the permanent database table `invalid_symbols`. */
export async function blacklistSymbol(
  symbol: string,
  reason: string,
  provider?: string,
): Promise<void> {
  if (!symbol) return;
  const cleanSymbol = symbol.trim().toUpperCase();
  memoryBlacklist.add(cleanSymbol);

  const db = client();
  if (!db) return;
  try {
    await ensureTable(db);
    await db`
      INSERT INTO invalid_symbols (symbol, reason, provider, created_at)
      VALUES (${cleanSymbol}, ${reason}, ${provider ?? 'all'}, NOW())
      ON CONFLICT (symbol)
      DO UPDATE SET reason = EXCLUDED.reason, provider = EXCLUDED.provider
    `;
  } catch {
    // Best-effort
  }
}

/** Remove a symbol from the invalid_symbols table (e.g. if re-added or corrected). */
export async function removeFromBlacklist(symbol: string): Promise<void> {
  if (!symbol) return;
  const cleanSymbol = symbol.trim().toUpperCase();
  memoryBlacklist.delete(cleanSymbol);

  const db = client();
  if (!db) return;
  try {
    await ensureTable(db);
    await db`
      DELETE FROM invalid_symbols WHERE symbol = ${cleanSymbol}
    `;
  } catch {
    // Best-effort
  }
}

/** Retrieve all blacklisted symbols (for admin or debug UI). */
export async function getBlacklistedSymbols(): Promise<InvalidSymbolRecord[]> {
  const db = client();
  if (!db) {
    return Array.from(memoryBlacklist).map((s) => ({
      symbol: s,
      reason: 'Blacklisted in memory',
      createdAt: new Date().toISOString(),
    }));
  }
  try {
    await ensureTable(db);
    const rows = await db<
      Array<{ symbol: string; reason: string; provider: string | null; created_at: Date }>
    >`
      SELECT symbol, reason, provider, created_at
      FROM invalid_symbols
      ORDER BY created_at DESC
    `;
    return rows.map((r) => ({
      symbol: r.symbol,
      reason: r.reason,
      provider: r.provider,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

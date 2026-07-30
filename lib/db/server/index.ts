import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// ============================================================================
// Date Serialization Fix (Section 2.1 of Spec)
// ============================================================================

export function serializeDates<T>(obj: T): T {
    if (obj instanceof Date) return obj.toISOString() as T;
    if (Array.isArray(obj)) return obj.map(serializeDates) as T;
    if (obj !== null && typeof obj === 'object') {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = serializeDates(value);
        }
        return result;
    }
    return obj;
}

export function wrapPostgres(client: any) {
    const originalUnsafe = client.unsafe.bind(client);
    client.unsafe = (query: string, params?: any[]) => {
        return originalUnsafe(query, params ? serializeDates(params) : params);
    };
    return client;
}

// ============================================================================
// Database Client Selection
// ============================================================================

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tradingdiary';

// Long-lived container (not serverless) → use a real connection pool. At max: 1
// a db.transaction() starved concurrent queries and postgres-js crashed with
// "reading 'queue'" — which silently failed every settings sync.
//
// Do NOT re-wrap client.unsafe here: that wrapper made postgres-js reject
// pooled transactions with "UNSAFE_TRANSACTION: Only use sql.begin ... or
// max: 1". Nothing in the app relies on the wrapper, and the scanner client
// (unwrapped, pooled) runs the same drizzle transactions correctly.
const client = postgres(connectionString, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    // All schema timestamps are currently `timestamp without time zone`.
    // Force a UTC session so ISO strings written by the app and PostgreSQL
    // `now()` comparisons use the same clock on local and production hosts.
    connection: { TimeZone: 'UTC' },
});

export const db = drizzle(client, { schema });

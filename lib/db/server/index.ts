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

const client = postgres(connectionString, {
    // This runs as a long-lived container (not serverless), so it needs a real
    // connection pool. At max: 1 a `db.transaction()` reserves the only
    // connection and any concurrent query gets `undefined`, which postgres-js
    // surfaces as "Cannot read properties of undefined (reading 'queue')" /
    // "setting 'onclose'" — that crash was silently failing every settings sync
    // (POST /api/watch/sync), so pattern/session/frequency/category changes
    // never persisted.
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
});

// Apply the Date serialization wrapper
const wrappedClient = wrapPostgres(client);

export const db = drizzle(wrappedClient, { schema });

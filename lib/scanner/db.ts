// Dedicated database client for the scanner worker.
//
// The app's client (lib/db/server) is tuned for serverless request handlers
// (max: 1) and wraps `.unsafe` for date serialization. A long-running worker
// doing transactions under concurrency needs a real connection pool, so it
// gets its own client here rather than sharing the request-scoped singleton.

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/lib/db/server/schema';
import { scannerConfig } from '@/lib/scanner/env';

const connectionString =
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tradingdiary';

export const sqlClient = postgres(connectionString, {
  max: Math.max(4, scannerConfig.concurrency + 2),
  connection: { TimeZone: 'UTC' },
});

export const db = drizzle(sqlClient, { schema });

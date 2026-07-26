// Side-effect module: load .env.local for the standalone scanner process.
//
// Next.js auto-loads .env.local, but a plain `tsx` process does not. Importing
// this FIRST (before any module that reads process.env at import time, e.g.
// lib/scanner/db.ts) makes `npm run scanner` pick up local DATABASE_URL /
// REDIS_URL. dotenv does not override already-set vars, so in production
// (compose-injected env, no .env.local) this is a harmless no-op.
import { config } from 'dotenv';

config({ path: '.env.local' });

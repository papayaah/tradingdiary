import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Ensure secrets are available for migrations (Section 5.1 of Spec)
config({ path: '.env.local' });

export default defineConfig({
    schema: './lib/db/server/schema.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/tradingdiary',
    },
});

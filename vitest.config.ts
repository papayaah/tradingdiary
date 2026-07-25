import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Map the "@/..." path alias (from tsconfig) so scanner modules that import
// "@/lib/..." resolve under Vitest too.
const root = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');

export default defineConfig({
  resolve: {
    alias: { '@': root },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});

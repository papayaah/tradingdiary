import '@/lib/scanner/load-env';
import { db } from '@/lib/scanner/db';
import { serverWatch } from '@/lib/db/server/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const cryptoWatches = await db
    .select()
    .from(serverWatch)
    .where(eq(serverWatch.enabled, true));

  const cryptosOnly = cryptoWatches.filter((w) => w.assetClass === 'crypto' || w.symbol.endsWith('-USD'));

  console.log(`=== DB CRYPTO SUBSCRIPTIONS AUDIT ===`);
  console.log(`Total Active Crypto Watches in DB: ${cryptosOnly.length}`);

  const usersSet = new Set(cryptosOnly.map((w) => w.userId));
  console.log(`Total Unique Users Subscribed: ${usersSet.size}`);
  console.log(`User IDs: ${Array.from(usersSet).join(', ') || 'None'}`);

  const symbolMap: Record<string, string[]> = {};
  for (const w of cryptosOnly) {
    if (!symbolMap[w.symbol]) symbolMap[w.symbol] = [];
    symbolMap[w.symbol].push(w.userId);
  }

  console.log(`\n=== UNIQUE CRYPTO SYMBOLS SCANNED (${Object.keys(symbolMap).length}) ===`);
  for (const [symbol, users] of Object.entries(symbolMap)) {
    console.log(`- ${symbol}: ${users.length} active user(s) watching (${users.join(', ')})`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});

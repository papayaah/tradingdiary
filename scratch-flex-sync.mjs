import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });

const { syncIbkrFlexConnection } = await import('./lib/ibkr-flex/sync.ts');
const { getFlexConnection } = await import('./lib/ibkr-flex/repository.ts');

// Patch the sync's catch is not accessible, so instead replicate + verbose.
import { decryptFlexToken } from './lib/ibkr-flex/crypto.ts';
import { retrieveFlexStatement } from './lib/ibkr-flex/client.ts';
import { detectAndParseBroker } from './lib/import/registry.ts';
import { pushJournal } from './lib/journal/server-sync.ts';

// find the userId from the single connection row
import { db } from './lib/db/server/index.ts';
import { ibkrFlexConnection } from './lib/db/server/schema.ts';

const [row] = await db.select().from(ibkrFlexConnection).limit(1);
if (!row) { console.log('no connection row'); process.exit(1); }
console.log('userId:', row.userId, 'queryId:', row.queryId);

try {
  const token = decryptFlexToken(row.encryptedToken);
  console.log('token decrypted, length', token.length);
  const statement = await retrieveFlexStatement(token, row.queryId);
  console.log('statement length', statement.length);
  console.log('statement head:', JSON.stringify(statement.slice(0, 300)));
  const parsed = await detectAndParseBroker({
    content: statement,
    filename: statement.trimStart().startsWith('<') ? 'ibkr-flex.xml' : 'ibkr-flex.csv',
  });
  console.log('parsed brokerId:', parsed?.brokerId, 'txns:', parsed?.transactions?.length);

  const { toTransactionRecords } = await import('./lib/import/converter.ts');
  // Replicate buildJournalPayload grouping
  const byAcct = new Map();
  for (const t of parsed.transactions) {
    const a = (t.accountId?.trim() || 'default');
    if (!byAcct.has(a)) byAcct.set(a, []);
    byAcct.get(a).push(t);
  }
  const accounts = [], executions = [];
  for (const [acct, rows] of byAcct) {
    const clientId = `ibkr-flex:${acct || 'default'}`;
    accounts.push({ accountId: clientId, name: acct === 'default' ? 'Interactive Brokers' : `IBKR •${acct.slice(-4)}`, type: 'Interactive Brokers', currency: 'USD', address: '', importedAt: Date.now() });
    executions.push(...toTransactionRecords(rows, clientId, 'USD'));
  }
  console.log('accounts:', accounts.length, 'executions:', executions.length);
  const payload = { accounts, executions, cashFlows: [], dailyNotes: [], tradeNotes: [], tags: [], tradeTags: [], reviews: [], deletes: [] };
  console.log('calling pushJournal...');
  const res = await pushJournal(row.userId, payload);
  console.log('pushJournal OK:', JSON.stringify(res));
} catch (e) {
  console.error('REAL ERROR:', e);
  console.error('STACK:', e?.stack);
}
process.exit(0);

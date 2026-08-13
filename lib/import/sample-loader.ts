import { parseTLGFile } from '@/lib/import/brokers/ibkr/tlg-parser';
import { importData } from '@/lib/db/trades';

export async function loadDemoSampleData(): Promise<{
  success: boolean;
  accountId: string;
  accountName: string;
  transactionCount: number;
}> {
  const res = await fetch('/samples/demo-ibkr.tlg');
  if (!res.ok) {
    throw new Error('Failed to load sample TLG file.');
  }

  const content = await res.text();
  const parsed = parseTLGFile(content);

  if (!parsed.account || parsed.transactions.length === 0) {
    throw new Error('Sample TLG file contains no valid trade records.');
  }

  await importData(parsed.account, parsed.transactions, parsed.positions);

  return {
    success: true,
    accountId: parsed.account.accountId,
    accountName: parsed.account.name,
    transactionCount: parsed.transactions.length,
  };
}

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

  // Dynamically adjust sample trade dates to match the user's current month & year
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');

  const adjustedTransactions = parsed.transactions.map((t) => {
    const day = t.date.length >= 8 ? t.date.slice(6, 8) : '01';
    return {
      ...t,
      date: `${currentYear}${currentMonth}${day}`,
    };
  });

  await importData(parsed.account, adjustedTransactions, parsed.positions);

  return {
    success: true,
    accountId: parsed.account.accountId,
    accountName: parsed.account.name,
    transactionCount: adjustedTransactions.length,
  };
}

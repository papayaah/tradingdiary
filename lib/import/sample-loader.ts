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

  // Dynamically map sample trades across 3 consecutive months up to the current month
  const now = new Date();

  const getYearMonthForOffset = (offset: number) => {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}${m}`;
  };

  const monthMap: Record<string, string> = {
    '202606': getYearMonthForOffset(2), // 2 months ago
    '202607': getYearMonthForOffset(1), // 1 month ago
    '202608': getYearMonthForOffset(0), // current month
  };

  const adjustedTransactions = parsed.transactions.map((t) => {
    const origYm = t.date.slice(0, 6);
    const day = t.date.length >= 8 ? t.date.slice(6, 8) : '05';
    const targetYm = monthMap[origYm] || getYearMonthForOffset(0);

    return {
      ...t,
      date: `${targetYm}${day}`,
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

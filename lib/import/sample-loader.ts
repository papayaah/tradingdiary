import { parseTLGFile } from '@/lib/import/brokers/ibkr/tlg-parser';
import { importData } from '@/lib/db/trades';
import { enrichTransactionsWithHistoricalFx } from '@/lib/fx/enrich-transactions';

const DAY_MS = 86_400_000;

function parseSampleDate(date: string): Date {
  return new Date(Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(4, 6)) - 1,
    Number(date.slice(6, 8)),
  ));
}

function formatSampleDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('');
}

export function recentSampleDateShift(dates: string[], now = new Date()): number {
  const newest = dates.reduce((latest, date) => date > latest ? date : latest, '');
  if (!newest) return 0;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const differenceInDays = Math.floor((today - parseSampleDate(newest).getTime()) / DAY_MS);
  // Whole-week shifts preserve every sample trade's original weekday. The
  // newest trade consequently lands today or within the preceding six days.
  return Math.floor(differenceInDays / 7) * 7;
}

export function shiftSampleDate(date: string, days: number): string {
  const shifted = parseSampleDate(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return formatSampleDate(shifted);
}

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

  const shiftDays = recentSampleDateShift(parsed.transactions.map((transaction) => transaction.date));
  const adjustedTransactions = parsed.transactions.map((transaction) => ({
    ...transaction,
    date: shiftSampleDate(transaction.date, shiftDays),
  }));
  const adjustedPositions = parsed.positions.map((position) => ({
    ...position,
    date: shiftSampleDate(position.date, shiftDays),
  }));

  const transactionsWithFx = await enrichTransactionsWithHistoricalFx(
    adjustedTransactions,
    parsed.account.currency,
  );
  await importData(parsed.account, transactionsWithFx, adjustedPositions);

  return {
    success: true,
    accountId: parsed.account.accountId,
    accountName: parsed.account.name,
    transactionCount: transactionsWithFx.length,
  };
}

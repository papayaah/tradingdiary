import type { NormalizedTransaction } from '../types';
import { parseCSVOrText } from '../utils/csv-extractor';
import type { BrokerImportSource } from './types';

export interface DelimitedRows {
  headers: string[];
  rows: Record<string, string>[];
}

export async function parseDelimitedSource(source: BrokerImportSource): Promise<DelimitedRows> {
  return parseCSVOrText(source.content);
}

export function collectTransactions(
  rows: Record<string, string>[],
  mapper: (row: Record<string, string>, index: number) => NormalizedTransaction | undefined,
): { transactions: NormalizedTransaction[]; skipped: number } {
  const transactions: NormalizedTransaction[] = [];
  let skipped = 0;

  rows.forEach((row, index) => {
    const transaction = mapper(row, index);
    if (transaction) transactions.push(transaction);
    else skipped += 1;
  });

  return { transactions, skipped };
}

export function skippedWarning(skipped: number): string[] {
  return skipped > 0
    ? [`Skipped ${skipped} non-trade, incomplete, cancelled, or summary row${skipped === 1 ? '' : 's'}.`]
    : [];
}

import type { AccountRecord, TransactionRecord, PositionRecord } from '../db/schema';

export interface ParsedTLGFile {
  account: AccountRecord;
  transactions: TransactionRecord[];
  positions: PositionRecord[];
}

type Side = TransactionRecord['side'];

export function parseTLGFile(content: string): ParsedTLGFile {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);

  let account: AccountRecord | null = null;
  const transactions: TransactionRecord[] = [];
  const positions: PositionRecord[] = [];

  for (const line of lines) {
    if (line.startsWith('ACT_INF|')) {
      const parts = line.split('|');
      account = {
        accountId: parts[1],
        name: parts[2],
        type: parts[3],
        address: parts[4] || '',
        importedAt: Date.now(),
      };
    } else if (line.startsWith('STK_TRD|')) {
      const parts = line.split('|');
      transactions.push({
        tradeId: parts[1],
        accountId: account?.accountId || '',
        symbol: parts[2],
        companyName: parts[3],
        exchanges: parts[4],
        side: parts[5] as Side,
        orderType: parts[6],
        date: parts[7],
        time: parts[8],
        currency: parts[9],
        quantity: parseFloat(parts[10]),
        multiplier: parseFloat(parts[11]),
        price: parseFloat(parts[12]),
        totalValue: parseFloat(parts[13]),
        commission: parseFloat(parts[14]),
        feeMultiplier: parseFloat(parts[15]),
      });
    } else if (line.startsWith('STK_LOT|')) {
      const parts = line.split('|');
      positions.push({
        accountId: parts[1],
        symbol: parts[2],
        companyName: parts[3],
        currency: parts[4],
        date: parts[5] || '',
        time: parts[6],
        quantity: parseFloat(parts[7]),
        multiplier: parseFloat(parts[8]),
        avgPrice: parseFloat(parts[9]),
        totalValue: parseFloat(parts[10]),
        feeMultiplier: parseFloat(parts[11]),
      });
    }
  }

  if (!account) {
    throw new Error('No account information found in TLG file');
  }

  return { account, transactions, positions };
}

import type { AccountRecord, TransactionRecord, PositionRecord } from '../../../db/schema';

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
        currency: 'USD',
        importedAt: Date.now(),
      };
    } else if (line.startsWith('STK_TRD|') || line.startsWith('FUT_TRD|')) {
      const parts = line.split('|');
      let side = parts[5];
      if (side === 'BUY') side = 'BUYTOOPEN';
      else if (side === 'SELL') side = 'SELLTOCLOSE';
      else if (side === 'BOT') side = 'BUYTOOPEN';
      else if (side === 'SLD') side = 'SELLTOCLOSE';

      // For futures the trade code (parts[2], e.g. "056U", "MCLU6") is IBKR's
      // per-contract local code — unreadable and expiry-specific. The human
      // product root lives in the first token of the description (parts[3], e.g.
      // "K200M 10SEP26" → "K200M"). Use the root as the symbol so contract months
      // group together and it's recognizable; keep the code + expiry as the name.
      // Stocks are unchanged (parts[2] is the ticker, parts[3] the company name).
      const isFutures = line.startsWith('FUT_TRD|');
      let symbol = parts[2];
      let companyName = parts[3];
      if (isFutures) {
        const description = (parts[3] || '').trim();
        const [root, ...rest] = description.split(/\s+/);
        if (root) symbol = root;
        const expiry = rest.join(' ');
        companyName = expiry ? `${parts[2]} · ${expiry}` : parts[2];
      }

      transactions.push({
        tradeId: parts[1],
        accountId: account?.accountId || '',
        symbol,
        companyName,
        exchanges: parts[4],
        side: side as Side,
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
        // The final column is IBKR's exact per-trade FX rate into the account
        // base currency (USD for these statements). Use it directly so realized
        // P&L matches the broker instead of a historical daily rate.
        fxRateToAccount: parseFloat(parts[15]),
        fxAccountCurrency: 'USD',
        fxRateDate: parts[7],
        fxRateProvider: 'ibkr',
      });
    } else if (line.startsWith('STK_LOT|') || line.startsWith('FUT_LOT|')) {
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

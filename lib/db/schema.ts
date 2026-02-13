import type { DBSchema } from 'idb';

export interface AccountRecord {
  accountId: string;
  name: string;
  type: string;
  address: string;
  importedAt: number;
}

export interface TransactionRecord {
  tradeId: string;
  accountId: string;
  symbol: string;
  companyName: string;
  exchanges: string;
  side: 'BUYTOOPEN' | 'SELLTOOPEN' | 'BUYTOCLOSE' | 'SELLTOCLOSE';
  orderType: string;
  date: string;
  time: string;
  currency: string;
  quantity: number;
  multiplier: number;
  price: number;
  totalValue: number;
  commission: number;
  feeMultiplier: number;
}

export interface PositionRecord {
  id?: number;
  accountId: string;
  symbol: string;
  companyName: string;
  currency: string;
  date: string;
  time: string;
  quantity: number;
  multiplier: number;
  avgPrice: number;
  totalValue: number;
  feeMultiplier: number;
}

export interface DailyNoteRecord {
  date: string;
  accountId: string;
  content: string;
  updatedAt: number;
}

export interface TradeNoteRecord {
  date: string;
  symbol: string;
  accountId: string;
  content: string;
  tags: string[];
  updatedAt: number;
}

export interface TradingDiaryDB extends DBSchema {
  accounts: {
    key: string;
    value: AccountRecord;
  };
  transactions: {
    key: string;
    value: TransactionRecord;
    indexes: {
      'by-date': string;
      'by-symbol': string;
      'by-date-symbol': [string, string];
      'by-accountId': string;
    };
  };
  positions: {
    key: number;
    value: PositionRecord;
    indexes: {
      'by-accountId': string;
      'by-symbol': string;
    };
  };
  dailyNotes: {
    key: [string, string];
    value: DailyNoteRecord;
  };
  tradeNotes: {
    key: [string, string, string];
    value: TradeNoteRecord;
  };
}

import type { DBSchema } from 'idb';

export interface AccountRecord {
  accountId: string;
  name: string;
  type: string; // e.g., "Charles Schwab", "IBKR", "Custom"
  currency: string;
  address: string;
  importedAt: number;
  initialBalance?: number;
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
  realizedPnL?: number;
  unrealizedPnL?: number;
  /** Fixed historical multiplier from transaction currency into account currency. */
  fxRateToAccount?: number;
  fxAccountCurrency?: string;
  /** Provider rate date in YYYYMMDD form. */
  fxRateDate?: string;
  fxRateProvider?: 'exchange-rate-api';
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

/**
 * A reusable, categorized label applied to trades. Categories group tags
 * (setup, mistake, emotion, market-condition, or user-defined). Archived tags
 * stay attached to historical trades but are hidden from new-tag pickers.
 */
export interface TagRecord {
  id: string;
  label: string;
  category: string;
  color?: string;
  archivedAt?: number;
  updatedAt: number;
}

/**
 * A non-trade change to account capital or balance. Kept separate from trading
 * P&L so account equity and return are not conflated with deposits/withdrawals.
 * See docs/specs P0 #6. `amount` is signed in the account currency (deposits,
 * interest, dividends positive; withdrawals, fees negative; adjustment either).
 */
export type CashFlowType =
  | 'deposit'
  | 'withdrawal'
  | 'interest'
  | 'dividend'
  | 'fee'
  | 'adjustment';

export interface CashFlowRecord {
  id: string;
  accountId: string;
  date: string; // YYYYMMDD
  type: CashFlowType;
  amount: number; // signed, account currency
  currency: string;
  note?: string;
  updatedAt: number;
}

export interface DailyNoteRecord {
  date: string;
  accountId: string;
  content: string;
  screenshotIds?: number[];
  updatedAt: number;
}

export interface TradeNoteRecord {
  /** Flat-to-flat trade-group key — the note's identity (one note per round trip). */
  tradeGroupKey: string;
  // Denormalized for display/search; not the identity.
  date: string;
  symbol: string;
  accountId: string;
  content: string;
  /** Legacy free-text tags (pre-categorized-tags); retained for back-compat. */
  tags: string[];
  /** Stable ids of applied TagRecords. */
  tagIds?: string[];
  screenshotIds?: number[];
  updatedAt: number;
}

export interface ObservationEvidence {
  metric: string;
  value: string;
  source?: 'METRIC' | 'EVENT' | 'STRATEGY_RULE';
}

export interface TradeAIReviewObservation {
  label: string;
  detail: string;
  evidence?: ObservationEvidence[];
}

export interface TradeAIReviewRecord {
  id: string; // keyPath
  date: string;
  symbol: string;
  accountId: string;
  tradeGroupId: string; // `${date}:${symbol}:${accountId}` — indexed
  summary: string;
  observations: TradeAIReviewObservation[];
  executionReview?: string;
  riskReview?: string;
  questionsForTrader?: string[];
  takeaway?: string;
  evidenceConfidence: 'low' | 'medium' | 'high';
  // Provenance for reproducibility / cross-model comparison
  provider: string;
  model: string;
  promptVersion: string;
  contextHash: string;
  createdAt: number;
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
  cashFlows: {
    key: string;
    value: CashFlowRecord;
    indexes: {
      'by-accountId': string;
    };
  };
  tags: {
    key: string;
    value: TagRecord;
  };
  tradeNotes: {
    key: string;
    value: TradeNoteRecord;
  };
  tradeAIReviews: {
    key: string;
    value: TradeAIReviewRecord;
    indexes: {
      'by-tradeGroup': string;
    };
  };
}

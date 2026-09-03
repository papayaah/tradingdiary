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
  /** Broker's official trading day (YYYYMMDD) for day attribution. May differ
   * from `date` for overnight/foreign sessions (IBKR TradeDate). Falls back to
   * `date` when the source doesn't distinguish them. */
  tradeDate?: string;
  currency: string;
  quantity: number;
  multiplier: number;
  price: number;
  totalValue: number;
  commission: number;
  feeMultiplier: number;
  realizedPnL?: number;
  unrealizedPnL?: number;
  /**
   * Multiplier from transaction currency into account currency. Prefer the
   * broker's exact per-trade rate (`fxRateProvider: 'ibkr'`, from the trade log's
   * FX-to-base column) so realized P&L matches the broker; otherwise a historical
   * daily rate is filled in as a fallback.
   */
  fxRateToAccount?: number;
  fxAccountCurrency?: string;
  /** Provider rate date in YYYYMMDD form. */
  fxRateDate?: string;
  fxRateProvider?: 'exchange-rate-api' | 'ibkr';
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

/** One rule inside a playbook. `id` is stable across edits so per-trade rule
 * checks survive renames/reordering of the rule text. */
export interface StrategyRule {
  id: string;
  text: string;
}

/**
 * A reusable strategy / playbook: the repeatable setup a trade belongs to, with
 * its rules. Linked to trades by stable `id` (not name), so renaming a playbook
 * preserves historical linkage. Archived playbooks stay attached to past trades
 * but are hidden from new-link pickers. See docs/specs P0 #3.
 */
export interface StrategyRecord {
  id: string;
  name: string;
  thesis?: string;
  /** Which directions the setup applies to. */
  direction?: 'long' | 'short' | 'both';
  rules: StrategyRule[];
  archivedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** Whether a trade followed a given playbook rule. */
export type RuleAdherenceStatus = 'followed' | 'violated' | 'not-applicable';

/** A trade's adherence to one playbook rule. `source` distinguishes a trader's
 * self-report from a deterministically-evaluated rule (all 'trader' for now). */
export interface RuleCheck {
  ruleId: string;
  status: RuleAdherenceStatus;
  source: 'trader' | 'deterministic';
  note?: string;
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

/**
 * A record of one import action. Captures what was imported (source, counts,
 * warnings) and — critically — the exact execution ids the batch created, so the
 * batch can be undone later without touching executions that came from other
 * imports. Local-only (import history is per-device); the executions it created
 * still sync normally, and undoing removes them (which propagates as deletes).
 */
export interface ImportBatchRecord {
  id: string;
  accountId: string;
  createdAt: number;
  /** Source filename, or a label for pasted/URL/multi-file imports. */
  source: string;
  /** Detected broker/source label, when known. */
  brokerName?: string;
  /** Fingerprint of the imported execution set (see executionSetChecksum). */
  checksum: string;
  /** Executions parsed from the source. */
  parsedCount: number;
  /** New executions actually written (parsed minus duplicates). */
  importedCount: number;
  /** Executions skipped because they were already present. */
  duplicateCount: number;
  /** Execution ids this batch created — the undo target. */
  tradeIds: string[];
  warnings?: string[];
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
  /** Primary playbook linked to this trade (StrategyRecord id). */
  strategyId?: string;
  /** Per-rule adherence for the linked playbook. */
  ruleChecks?: RuleCheck[];
  /** Trade plan — planned risk inputs the trader recorded. All optional and
   * native to the instrument's price. Used to derive planned/realized R. */
  plannedEntry?: number;
  initialStop?: number;
  targets?: number[];
  plannedRiskAmount?: number;
  plannedRiskPercent?: number;
  /** When the plan was created relative to the trade. */
  planTiming?: 'before' | 'during' | 'after';
  /** Optional 1–5 self-ratings; execution and process are kept distinct so a
   * profitable rule-breaking trade can still score a low process rating. */
  executionRating?: number;
  processRating?: number;
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
  strategies: {
    key: string;
    value: StrategyRecord;
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
  importBatches: {
    key: string;
    value: ImportBatchRecord;
    indexes: {
      'by-accountId': string;
    };
  };
}

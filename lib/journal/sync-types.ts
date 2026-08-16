import type {
  AccountRecord,
  TransactionRecord,
  DailyNoteRecord,
  TradeNoteRecord,
  TradeAIReviewRecord,
} from '../db/schema';

/**
 * Wire contract shared by the client sync engine and /api/journal/sync.
 * See docs/specs/journal-persistence-and-sync.md.
 *
 * Trade groups are NOT part of the wire contract: they are derived on both sides
 * by the pure, deterministic splitter (lib/trading/trade-groups.ts), which yields
 * identical `clientKey`s. Notes/tags/reviews reference a trade by that key, so
 * the client never needs the server's UUID to attach a note.
 */

/** A note on one trade, addressed by the splitter's deterministic trade-group key. */
export interface SyncTradeNote {
  tradeGroupClientKey: string;
  content: string;
  updatedAt: number;
  /** Last rev the client synced for this note; used for conflict detection. */
  baseRev: number;
}

export interface SyncDailyNote {
  accountId: string; // client account id
  tradingDay: string; // YYYYMMDD
  content: string;
  updatedAt: number;
  baseRev: number;
}

export interface SyncTag {
  clientId: string;
  label: string;
  category: string;
  color?: string;
  archived?: boolean;
  updatedAt: number;
  baseRev: number;
}

export interface SyncTradeTag {
  tradeGroupClientKey: string;
  tagClientId: string;
}

export interface SyncReview extends Omit<TradeAIReviewRecord, 'tradeGroupId'> {
  tradeGroupClientKey: string;
  baseRev: number;
}

export type SyncEntity =
  | 'account'
  | 'execution'
  | 'trade_group'
  | 'daily_note'
  | 'trade_note'
  | 'tag'
  | 'review'
  | 'attachment';

export interface SyncDelete {
  entity: SyncEntity;
  /** Client-side identity of the deleted row (account id, trade-group key, etc). */
  clientKey: string;
  baseRev: number;
}

/** Client → server push payload. */
export interface JournalPushRequest {
  accounts: AccountRecord[];
  executions: TransactionRecord[];
  dailyNotes: SyncDailyNote[];
  tradeNotes: SyncTradeNote[];
  tags: SyncTag[];
  tradeTags: SyncTradeTag[];
  reviews: SyncReview[];
  deletes: SyncDelete[];
}

/** A row the server rejected because the client's baseRev was stale. Carries the
 * server's current version so the client can present a choose/merge step. */
export interface SyncConflict {
  entity: SyncEntity;
  clientKey: string;
  serverRev: number;
  serverValue: unknown;
}

export interface JournalPushResponse {
  authenticated: boolean;
  seq: number;
  conflicts: SyncConflict[];
  /** Count of executions newly adopted this push (for the merge summary). */
  adoptedExecutions: number;
}

/** Server → client pull payload. On `since=0` this is a full snapshot. */
export interface JournalPullResponse {
  authenticated: boolean;
  seq: number;
  accounts: (AccountRecord & { rev: number })[];
  executions: TransactionRecord[];
  dailyNotes: (DailyNoteRecord & { rev: number })[];
  tradeNotes: (TradeNoteRecord & { tradeGroupClientKey: string; rev: number })[];
  tags: (SyncTag & { rev: number })[];
  tradeTags: SyncTradeTag[];
  reviews: (SyncReview & { rev: number })[];
  /** Client keys of rows deleted since the cursor (tombstones). */
  deletes: SyncDelete[];
}

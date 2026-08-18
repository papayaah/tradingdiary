import { getDB } from './database';
import type {
  DailyNoteRecord,
  TradeNoteRecord,
  TradeAIReviewRecord,
  RuleCheck,
} from './schema';
import { notifyJournalChanged } from '@/lib/journal/sync-bus';

/**
 * A trade's identity for notes/reviews: the flat-to-flat trade-group key, plus
 * denormalized date/symbol/account for display and search. Falls back to a
 * day+symbol composite for any trade lacking a group key (legacy aggregation).
 */
export interface TradeRef {
  tradeGroupKey: string;
  date: string;
  symbol: string;
  accountId: string;
}

export function tradeRef(
  trade: { groupKey?: string; date: string; symbol: string },
  accountId: string,
): TradeRef {
  return {
    tradeGroupKey: trade.groupKey ?? `${trade.date}:${trade.symbol}:${accountId}`,
    date: trade.date,
    symbol: trade.symbol,
    accountId,
  };
}

export async function getDailyNote(
  date: string,
  accountId: string
): Promise<DailyNoteRecord | undefined> {
  const db = await getDB();
  return db.get('dailyNotes', [date, accountId]);
}

export async function saveDailyNote(
  date: string,
  accountId: string,
  content: string
) {
  const db = await getDB();
  const existing = await db.get('dailyNotes', [date, accountId]);
  await db.put('dailyNotes', {
    date,
    accountId,
    content,
    screenshotIds: existing?.screenshotIds,
    updatedAt: Date.now(),
  });
  notifyJournalChanged();
}

export async function getAllDailyNotes(): Promise<DailyNoteRecord[]> {
  const db = await getDB();
  return db.getAll('dailyNotes');
}

export async function getAllTradeNotes(): Promise<TradeNoteRecord[]> {
  const db = await getDB();
  return db.getAll('tradeNotes');
}

export async function addScreenshotToDaily(
  date: string,
  accountId: string,
  assetId: number
) {
  const db = await getDB();
  const existing = await db.get('dailyNotes', [date, accountId]);
  const ids = existing?.screenshotIds ?? [];
  if (ids.includes(assetId)) return;
  await db.put('dailyNotes', {
    date,
    accountId,
    content: existing?.content ?? '',
    screenshotIds: [...ids, assetId],
    updatedAt: Date.now(),
  });
}

export async function removeScreenshotFromDaily(
  date: string,
  accountId: string,
  assetId: number
) {
  const db = await getDB();
  const existing = await db.get('dailyNotes', [date, accountId]);
  if (!existing?.screenshotIds) return;
  await db.put('dailyNotes', {
    ...existing,
    screenshotIds: existing.screenshotIds.filter((id) => id !== assetId),
    updatedAt: Date.now(),
  });
}

export async function getTradeNote(
  tradeGroupKey: string
): Promise<TradeNoteRecord | undefined> {
  const db = await getDB();
  return db.get('tradeNotes', tradeGroupKey);
}

/**
 * Read-modify-write a trade's note record, preserving every field not in the
 * patch. All per-trade writers go through this so adding a new field can never
 * silently wipe a sibling (tags, playbook link, plan, screenshots, …). Also
 * makes a debounced auto-save safe against a concurrently attached screenshot.
 */
async function patchTradeNote(ref: TradeRef, patch: Partial<TradeNoteRecord>): Promise<void> {
  const db = await getDB();
  const existing = await db.get('tradeNotes', ref.tradeGroupKey);
  const merged: TradeNoteRecord = {
    content: '',
    tags: [],
    ...(existing ?? {}),
    ...patch,
    // Identity + denormalized display fields stay authoritative.
    tradeGroupKey: ref.tradeGroupKey,
    date: existing?.date ?? ref.date,
    symbol: existing?.symbol ?? ref.symbol,
    accountId: existing?.accountId ?? ref.accountId,
    updatedAt: Date.now(),
  };
  await db.put('tradeNotes', merged);
  notifyJournalChanged();
}

/** Patch ONLY the note content, preserving everything else. */
export async function saveTradeNoteContent(ref: TradeRef, content: string) {
  await patchTradeNote(ref, { content });
}

/** Set the tag ids applied to a trade. */
export async function setTradeTags(ref: TradeRef, tagIds: string[]) {
  await patchTradeNote(ref, { tagIds });
}

/**
 * Link a playbook to a trade and record its rule adherence. Passing
 * strategyId = undefined unlinks the playbook and clears its rule checks.
 */
export async function setTradePlaybook(
  ref: TradeRef,
  strategyId: string | undefined,
  ruleChecks: RuleCheck[],
) {
  await patchTradeNote(ref, { strategyId, ruleChecks: strategyId ? ruleChecks : undefined });
}

/** Fields of the trade plan (planned risk / R inputs and self-ratings). */
export type TradePlanPatch = Pick<
  TradeNoteRecord,
  | 'plannedEntry'
  | 'initialStop'
  | 'targets'
  | 'plannedRiskAmount'
  | 'plannedRiskPercent'
  | 'planTiming'
  | 'executionRating'
  | 'processRating'
>;

/** Save the trade plan, preserving notes/tags/playbook/screenshots. */
export async function setTradePlan(ref: TradeRef, plan: TradePlanPatch) {
  await patchTradeNote(ref, plan);
}

/** All AI reviews for a trade group, newest first. */
export async function getTradeAIReviews(
  tradeGroupKey: string
): Promise<TradeAIReviewRecord[]> {
  const db = await getDB();
  const reviews = await db.getAllFromIndex('tradeAIReviews', 'by-tradeGroup', tradeGroupKey);
  return reviews.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveTradeAIReview(review: TradeAIReviewRecord): Promise<void> {
  const db = await getDB();
  await db.put('tradeAIReviews', review);
}

export async function deleteTradeAIReview(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('tradeAIReviews', id);
}

export async function addScreenshotToTrade(ref: TradeRef, assetId: number) {
  const db = await getDB();
  const existing = await db.get('tradeNotes', ref.tradeGroupKey);
  const ids = existing?.screenshotIds ?? [];
  if (ids.includes(assetId)) return;
  await db.put('tradeNotes', {
    tradeGroupKey: ref.tradeGroupKey,
    date: ref.date,
    symbol: ref.symbol,
    accountId: ref.accountId,
    content: existing?.content ?? '',
    tags: existing?.tags ?? [],
    screenshotIds: [...ids, assetId],
    updatedAt: Date.now(),
  });
  notifyJournalChanged();
}

export async function removeScreenshotFromTrade(tradeGroupKey: string, assetId: number) {
  const db = await getDB();
  const existing = await db.get('tradeNotes', tradeGroupKey);
  if (!existing?.screenshotIds) return;
  await db.put('tradeNotes', {
    ...existing,
    screenshotIds: existing.screenshotIds.filter((id) => id !== assetId),
    updatedAt: Date.now(),
  });
  notifyJournalChanged();
}

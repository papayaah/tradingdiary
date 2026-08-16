import { getDB } from './database';
import type {
  DailyNoteRecord,
  TradeNoteRecord,
  TradeAIReviewRecord,
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
 * Patch ONLY the note content, preserving screenshotIds and tags. Read-modify-write
 * so a debounced auto-save cannot clobber a concurrently attached screenshot.
 */
export async function saveTradeNoteContent(ref: TradeRef, content: string) {
  const db = await getDB();
  const existing = await db.get('tradeNotes', ref.tradeGroupKey);
  await db.put('tradeNotes', {
    tradeGroupKey: ref.tradeGroupKey,
    date: ref.date,
    symbol: ref.symbol,
    accountId: ref.accountId,
    content,
    tags: existing?.tags ?? [],
    screenshotIds: existing?.screenshotIds,
    updatedAt: Date.now(),
  });
  notifyJournalChanged();
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

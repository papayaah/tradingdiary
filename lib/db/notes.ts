import { getDB } from './database';
import type {
  DailyNoteRecord,
  TradeNoteRecord,
  TradeAIReviewRecord,
} from './schema';

/**
 * Derived single-string reference for a trade group. Pure function of the
 * composite [date, symbol, accountId] key — never stored as a separate identity.
 */
export function tradeGroupId(date: string, symbol: string, accountId: string): string {
  return `${date}:${symbol}:${accountId}`;
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
  date: string,
  symbol: string,
  accountId: string
): Promise<TradeNoteRecord | undefined> {
  const db = await getDB();
  return db.get('tradeNotes', [date, symbol, accountId]);
}

/**
 * Patch ONLY the note content, preserving screenshotIds and tags. Read-modify-write
 * so a debounced auto-save cannot clobber a concurrently attached screenshot.
 */
export async function saveTradeNoteContent(
  date: string,
  symbol: string,
  accountId: string,
  content: string
) {
  const db = await getDB();
  const existing = await db.get('tradeNotes', [date, symbol, accountId]);
  await db.put('tradeNotes', {
    date,
    symbol,
    accountId,
    content,
    tags: existing?.tags ?? [],
    screenshotIds: existing?.screenshotIds,
    updatedAt: Date.now(),
  });
}

/** All AI reviews for a trade group, newest first. */
export async function getTradeAIReviews(
  date: string,
  symbol: string,
  accountId: string
): Promise<TradeAIReviewRecord[]> {
  const db = await getDB();
  const groupId = tradeGroupId(date, symbol, accountId);
  const reviews = await db.getAllFromIndex('tradeAIReviews', 'by-tradeGroup', groupId);
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

export async function addScreenshotToTrade(
  date: string,
  symbol: string,
  accountId: string,
  assetId: number
) {
  const db = await getDB();
  const existing = await db.get('tradeNotes', [date, symbol, accountId]);
  const ids = existing?.screenshotIds ?? [];
  if (ids.includes(assetId)) return;
  await db.put('tradeNotes', {
    date,
    symbol,
    accountId,
    content: existing?.content ?? '',
    tags: existing?.tags ?? [],
    screenshotIds: [...ids, assetId],
    updatedAt: Date.now(),
  });
}

export async function removeScreenshotFromTrade(
  date: string,
  symbol: string,
  accountId: string,
  assetId: number
) {
  const db = await getDB();
  const existing = await db.get('tradeNotes', [date, symbol, accountId]);
  if (!existing?.screenshotIds) return;
  await db.put('tradeNotes', {
    ...existing,
    screenshotIds: existing.screenshotIds.filter((id) => id !== assetId),
    updatedAt: Date.now(),
  });
}

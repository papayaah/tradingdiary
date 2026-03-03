import { getDB } from './database';
import type { DailyNoteRecord, TradeNoteRecord } from './schema';

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

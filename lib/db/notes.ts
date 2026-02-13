import { getDB } from './database';
import type { DailyNoteRecord } from './schema';

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
  await db.put('dailyNotes', {
    date,
    accountId,
    content,
    updatedAt: Date.now(),
  });
}

export async function getAllDailyNotes(): Promise<DailyNoteRecord[]> {
  const db = await getDB();
  return db.getAll('dailyNotes');
}

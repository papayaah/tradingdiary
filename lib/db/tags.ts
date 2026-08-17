import { getDB } from './database';
import type { TagRecord } from './schema';
import { notifyJournalChanged } from '@/lib/journal/sync-bus';
import { findTagByIdentity, normalizeTagLabel, tagKey } from '@/lib/trading/tags';

export async function getAllTags(): Promise<TagRecord[]> {
  const db = await getDB();
  return db.getAll('tags');
}

export async function saveTag(tag: TagRecord): Promise<void> {
  const db = await getDB();
  await db.put('tags', tag);
  notifyJournalChanged();
}

/** Create a tag, or return the existing one with the same category+label. */
export async function createTag(
  category: string,
  label: string,
  color?: string,
): Promise<TagRecord> {
  const existing = await getAllTags();
  const dup = findTagByIdentity(existing, category, label);
  if (dup) return dup;
  const tag: TagRecord = {
    // Deterministic id so the same tag is identical across devices and server.
    id: tagKey(category, label),
    label: normalizeTagLabel(label),
    category: category.trim().toLowerCase(),
    color,
    updatedAt: Date.now(),
  };
  await saveTag(tag);
  return tag;
}

export async function archiveTag(id: string, archived: boolean): Promise<void> {
  const db = await getDB();
  const tag = await db.get('tags', id);
  if (!tag) return;
  await db.put('tags', { ...tag, archivedAt: archived ? Date.now() : undefined, updatedAt: Date.now() });
  notifyJournalChanged();
}

export async function deleteTag(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('tags', id);
  notifyJournalChanged();
}

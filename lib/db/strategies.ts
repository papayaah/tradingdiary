import { getDB } from './database';
import type { StrategyRecord } from './schema';
import { newId, normalizeStrategyName } from '@/lib/trading/strategies';
import { notifyJournalChanged } from '@/lib/journal/sync-bus';

export async function getAllStrategies(): Promise<StrategyRecord[]> {
  const db = await getDB();
  // Stale connection (older IndexedDB version in another tab) may lack this store.
  if (!db.objectStoreNames.contains('strategies')) return [];
  return db.getAll('strategies');
}

export async function getStrategy(id: string): Promise<StrategyRecord | undefined> {
  const db = await getDB();
  if (!db.objectStoreNames.contains('strategies')) return undefined;
  return db.get('strategies', id);
}

export async function saveStrategy(strategy: StrategyRecord): Promise<void> {
  const db = await getDB();
  await db.put('strategies', strategy);
  notifyJournalChanged();
}

export async function createStrategy(
  input: Pick<StrategyRecord, 'name'> & Partial<Omit<StrategyRecord, 'id' | 'name'>>,
): Promise<StrategyRecord> {
  const now = Date.now();
  const strategy: StrategyRecord = {
    id: newId('strat'),
    name: normalizeStrategyName(input.name),
    thesis: input.thesis,
    direction: input.direction ?? 'both',
    rules: input.rules ?? [],
    createdAt: now,
    updatedAt: now,
  };
  await saveStrategy(strategy);
  return strategy;
}

/** Patch an existing strategy, bumping updatedAt. No-op if it doesn't exist. */
export async function updateStrategy(
  id: string,
  patch: Partial<Omit<StrategyRecord, 'id' | 'createdAt'>>,
): Promise<StrategyRecord | undefined> {
  const db = await getDB();
  const existing = await db.get('strategies', id);
  if (!existing) return undefined;
  const next: StrategyRecord = {
    ...existing,
    ...patch,
    name: patch.name != null ? normalizeStrategyName(patch.name) : existing.name,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };
  await saveStrategy(next);
  return next;
}

export async function archiveStrategy(id: string, archived: boolean): Promise<void> {
  await updateStrategy(id, { archivedAt: archived ? Date.now() : undefined });
}

export async function deleteStrategy(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('strategies', id);
  notifyJournalChanged();
}

import { describe, expect, it } from 'vitest';
import type { TagRecord } from '@/lib/db/schema';
import {
  normalizeTagLabel,
  tagIdentity,
  findTagByIdentity,
  activeTagsByCategory,
} from './tags';

function tag(overrides: Partial<TagRecord>): TagRecord {
  return { id: crypto.randomUUID(), label: 'FOMO', category: 'emotion', updatedAt: 1, ...overrides };
}

describe('tags', () => {
  it('normalizes labels (trim, collapse whitespace)', () => {
    expect(normalizeTagLabel('  Opening   Range  ')).toBe('Opening Range');
  });

  it('treats case/whitespace-equal labels in a category as the same identity', () => {
    expect(tagIdentity('Emotion', 'FOMO')).toBe(tagIdentity('emotion', 'fomo'));
    expect(tagIdentity('setup', 'ORB')).not.toBe(tagIdentity('emotion', 'ORB'));
  });

  it('finds an existing tag by identity regardless of case', () => {
    const tags = [tag({ label: 'FOMO', category: 'emotion' })];
    expect(findTagByIdentity(tags, 'emotion', 'fomo')?.label).toBe('FOMO');
    expect(findTagByIdentity(tags, 'setup', 'fomo')).toBeUndefined();
  });

  it('groups active tags by category and hides archived', () => {
    const byCat = activeTagsByCategory([
      tag({ label: 'ORB', category: 'setup' }),
      tag({ label: 'Breakout', category: 'setup' }),
      tag({ label: 'Old', category: 'setup', archivedAt: 123 }),
      tag({ label: 'FOMO', category: 'emotion' }),
    ]);
    expect(byCat.get('setup')!.map((t) => t.label)).toEqual(['Breakout', 'ORB']); // sorted, no archived
    expect(byCat.get('emotion')!.map((t) => t.label)).toEqual(['FOMO']);
  });
});

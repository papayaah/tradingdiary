'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Plus } from 'lucide-react';
import type { TagRecord } from '@/lib/db/schema';
import { getAllTags, createTag } from '@/lib/db/tags';
import { getTradeNote, setTradeTags, type TradeRef } from '@/lib/db/notes';
import { DEFAULT_TAG_CATEGORIES, TAG_COLORS } from '@/lib/trading/tags';

interface TradeTagsEditorProps {
  tradeRef: TradeRef;
  onChange?: () => void;
}

/**
 * Attach reusable categorized tags to a trade. Creating a tag that doesn't exist
 * yet adds it to the shared tag set (de-duplicated by category+label). Embedded
 * panel — no modal.
 */
export default function TradeTagsEditor({ tradeRef, onChange }: TradeTagsEditorProps) {
  const [allTags, setAllTags] = useState<TagRecord[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [category, setCategory] = useState<string>(DEFAULT_TAG_CATEGORIES[0]);
  const [label, setLabel] = useState('');
  const key = tradeRef.tradeGroupKey;

  useEffect(() => {
    let active = true;
    (async () => {
      const [tags, note] = await Promise.all([getAllTags(), getTradeNote(key)]);
      if (!active) return;
      setAllTags(tags);
      setTagIds(note?.tagIds ?? []);
    })();
    return () => { active = false; };
  }, [key]);

  const tagsById = useMemo(() => new Map(allTags.map((t) => [t.id, t])), [allTags]);
  const applied = tagIds.map((id) => tagsById.get(id)).filter((t): t is TagRecord => Boolean(t));

  const persist = async (ids: string[]) => {
    setTagIds(ids);
    await setTradeTags(tradeRef, ids);
    onChange?.();
  };

  const handleAdd = async () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const color = TAG_COLORS[allTags.length % TAG_COLORS.length];
    const tag = await createTag(category, trimmed, color);
    setAllTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag]));
    if (!tagIds.includes(tag.id)) await persist([...tagIds, tag.id]);
    setLabel('');
  };

  const handleRemove = async (id: string) => {
    await persist(tagIds.filter((t) => t !== id));
  };

  const handleToggleExisting = async (id: string) => {
    await persist(tagIds.includes(id) ? tagIds.filter((t) => t !== id) : [...tagIds, id]);
  };

  const suggestions = allTags.filter(
    (t) => !t.archivedAt && t.category === category && !tagIds.includes(t.id),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted font-medium uppercase tracking-wider">Tags</span>
      </div>

      {/* Applied tags */}
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[1.5rem]">
        {applied.length === 0 && <span className="text-xs text-muted/50 italic">No tags yet</span>}
        {applied.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border"
            style={{
              color: t.color ?? undefined,
              borderColor: (t.color ?? '#64748b') + '55',
              backgroundColor: (t.color ?? '#64748b') + '18',
            }}
          >
            <span className="text-muted/70">{t.category}:</span>
            {t.label}
            <button onClick={() => handleRemove(t.id)} aria-label={`Remove ${t.label}`} className="hover:opacity-70">
              <X size={11} />
            </button>
          </span>
        ))}
      </div>

      {/* Add / pick */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-background/60 border border-card-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:border-accent outline-none"
        >
          {[...new Set([...DEFAULT_TAG_CATEGORIES, ...allTags.map((t) => t.category)])].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
          placeholder="Add a tag…"
          className="flex-1 min-w-[8rem] bg-background/60 border border-card-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted/50 focus:border-accent outline-none"
        />
        <button
          onClick={handleAdd}
          className="inline-flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20"
        >
          <Plus size={12} /> Add
        </button>
      </div>

      {/* Quick-pick existing tags in this category */}
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((t) => (
            <button
              key={t.id}
              onClick={() => handleToggleExisting(t.id)}
              className="rounded-full border border-card-border px-2 py-0.5 text-[11px] text-muted hover:text-foreground hover:border-accent/40"
            >
              + {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

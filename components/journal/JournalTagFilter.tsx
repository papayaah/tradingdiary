'use client';

import { Tag as TagIcon, X } from 'lucide-react';
import type { TagRecord } from '@/lib/db/schema';

interface JournalTagFilterProps {
  /** Tags actually applied to at least one trade. */
  tags: TagRecord[];
  selected: string[];
  onToggle: (tagId: string) => void;
  onClear: () => void;
}

/**
 * Filter the journal to trades carrying any of the selected tags. Only shows
 * tags that are actually in use, so it stays empty until the user tags a trade.
 */
export default function JournalTagFilter({ tags, selected, onToggle, onClear }: JournalTagFilterProps) {
  if (tags.length === 0) return null;

  const selectedSet = new Set(selected);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-card-border bg-card-bg/60 p-3">
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
        <TagIcon size={13} />
        Filter by tag
      </span>

      {tags.map((tag) => {
        const on = selectedSet.has(tag.id);
        return (
          <button
            key={tag.id}
            onClick={() => onToggle(tag.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
              on
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-card-border bg-card-bg text-muted hover:text-foreground hover:border-accent/40'
            }`}
          >
            {tag.color && (
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} aria-hidden="true" />
            )}
            {tag.label}
          </button>
        );
      })}

      {selected.length > 0 && (
        <button
          onClick={onClear}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-loss transition-colors"
        >
          <X size={12} />
          Clear
        </button>
      )}
    </div>
  );
}

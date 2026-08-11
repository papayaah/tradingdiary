'use client';

import { useEffect, useRef, useState } from 'react';
import { getTradeNote, saveTradeNoteContent } from '@/lib/db/notes';

interface TradeNotesEditorProps {
  date: string;
  symbol: string;
  accountId: string;
}

/**
 * Auto-saving textarea for the trader's personal reflections. Debounced; patches
 * only note content (screenshots/tags preserved by saveTradeNoteContent).
 */
export default function TradeNotesEditor({ date, symbol, accountId }: TradeNotesEditorProps) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadedFor = useRef<string>('');

  useEffect(() => {
    const key = `${date}:${symbol}:${accountId}`;
    loadedFor.current = key;
    getTradeNote(date, symbol, accountId).then((note) => {
      // Guard against races if props change before load resolves.
      if (loadedFor.current === key) {
        setValue(note?.content ?? '');
        setStatus('idle');
      }
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [date, symbol, accountId]);

  const handleChange = (next: string) => {
    setValue(next);
    setStatus('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await saveTradeNoteContent(date, symbol, accountId, next);
      setStatus('saved');
    }, 600);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted font-medium uppercase tracking-wider">Notes</span>
        <span className="text-[10px] text-muted/60 font-medium h-3">
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Your thoughts on this trade — plan, execution, what you'd do differently…"
        rows={3}
        className="w-full resize-y rounded-lg border border-card-border bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40"
      />
    </div>
  );
}

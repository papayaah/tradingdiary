'use client';

import { useEffect, useRef, useState } from 'react';
import { getTradeNote, saveTradeNoteContent, type TradeRef } from '@/lib/db/notes';

interface TradeNotesEditorProps {
  tradeRef: TradeRef;
  onChange?: () => void;
}

/**
 * Auto-saving textarea for the trader's personal reflections. Debounced; patches
 * only note content (screenshots/tags preserved by saveTradeNoteContent).
 */
export default function TradeNotesEditor({ tradeRef, onChange }: TradeNotesEditorProps) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadedFor = useRef<string>('');
  const key = tradeRef.tradeGroupKey;

  useEffect(() => {
    loadedFor.current = key;
    getTradeNote(key).then((note) => {
      // Guard against races if props change before load resolves.
      if (loadedFor.current === key) {
        setValue(note?.content ?? '');
        setStatus('idle');
      }
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key]);

  const handleChange = (next: string) => {
    setValue(next);
    setStatus('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await saveTradeNoteContent(tradeRef, next);
      setStatus('saved');
      onChange?.();
    }, 600);
  };

  const handleBlur = async () => {
    if (status !== 'saving') return;
    if (timer.current) clearTimeout(timer.current);
    await saveTradeNoteContent(tradeRef, value);
    setStatus('saved');
    onChange?.();
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
        onBlur={handleBlur}
        placeholder="Your thoughts on this trade — plan, execution, what you'd do differently…"
        rows={3}
        className="w-full resize-y rounded-lg border border-card-border bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40"
      />
    </div>
  );
}

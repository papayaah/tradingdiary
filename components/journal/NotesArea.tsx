'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  saveDailyNote,
  getDailyNote,
  addScreenshotToDaily,
  removeScreenshotFromDaily,
} from '@/lib/db/notes';
import ScreenshotAttachment from './ScreenshotAttachment';
import { BookOpen } from 'lucide-react';

interface NotesAreaProps {
  date: string;
  accountId: string;
}

export default function NotesArea({ date, accountId }: NotesAreaProps) {
  const [content, setContent] = useState('');
  const [screenshotIds, setScreenshotIds] = useState<number[]>([]);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    getDailyNote(date, accountId).then((note) => {
      if (note) {
        setContent(note.content);
        setScreenshotIds(note.screenshotIds ?? []);
      }
      setLoaded(true);
    });
  }, [date, accountId]);

  const save = useCallback(
    (value: string) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        saveDailyNote(date, accountId, value);
      }, 500);
    },
    [date, accountId]
  );

  const handleAddScreenshot = useCallback(
    async (assetId: number) => {
      await addScreenshotToDaily(date, accountId, assetId);
      setScreenshotIds((prev) => [...prev, assetId]);
    },
    [date, accountId]
  );

  const handleRemoveScreenshot = useCallback(
    async (assetId: number) => {
      await removeScreenshotFromDaily(date, accountId, assetId);
      setScreenshotIds((prev) => prev.filter((id) => id !== assetId));
    },
    [date, accountId]
  );

  if (!loaded) return null;

  return (
    <div className="px-6 py-4 bg-muted-bg/10 border-b border-card-border/50 space-y-3">
      <div className="flex items-center gap-2 text-[10px] font-bold text-muted uppercase tracking-widest mb-1">
        <BookOpen size={10} className="text-accent" />
        Daily Notes
      </div>
      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          save(e.target.value);
        }}
        placeholder="Click here to start typing your notes..."
        className="w-full bg-card-bg/50 border border-card-border/50 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted/40 placeholder:font-medium resize-none outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 transition-all min-h-[80px]"
        rows={3}
      />
      <div className="pt-1">
        <ScreenshotAttachment
          screenshotIds={screenshotIds}
          onAdd={handleAddScreenshot}
          onRemove={handleRemoveScreenshot}
        />
      </div>
    </div>
  );
}

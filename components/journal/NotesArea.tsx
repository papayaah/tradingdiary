'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  saveDailyNote,
  getDailyNote,
  addScreenshotToDaily,
  removeScreenshotFromDaily,
} from '@/lib/db/notes';
import ScreenshotAttachment from './ScreenshotAttachment';

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
    <div className="px-5 py-3 bg-card-bg border-b border-card-border space-y-2">
      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          save(e.target.value);
        }}
        placeholder="Click here to start typing your notes..."
        className="w-full bg-transparent text-sm text-foreground placeholder:text-muted/50 placeholder:italic resize-none outline-none min-h-[40px]"
        rows={2}
      />
      <ScreenshotAttachment
        screenshotIds={screenshotIds}
        onAdd={handleAddScreenshot}
        onRemove={handleRemoveScreenshot}
      />
    </div>
  );
}

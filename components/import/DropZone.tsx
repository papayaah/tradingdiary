'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileText, Image as ImageIcon, Clipboard, ClipboardCheck, Loader2 } from 'lucide-react';

interface DropZoneProps {
  onData: (data: File | string, type: 'file' | 'text' | 'image') => void;
  /** Handles a batch of dropped/browsed files as one unified import. */
  onFiles?: (files: File[]) => void;
  isProcessing?: boolean;
}

export default function DropZone({ onData, onFiles, isProcessing }: DropZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [pasteDetected, setPasteDetected] = useState(false);
  const [pasteError, setPasteError] = useState('');
  const pasteResetTimer = useRef<number | undefined>(undefined);

  const markPasteDetected = useCallback(() => {
    setPasteDetected(true);
    window.clearTimeout(pasteResetTimer.current);
    pasteResetTimer.current = window.setTimeout(() => setPasteDetected(false), 1500);
  }, []);

  // Clear a pending paste acknowledgement when the component unmounts.
  useEffect(() => {
    return () => window.clearTimeout(pasteResetTimer.current);
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    // Multiple files: hand the whole batch to the unified-import handler.
    if (acceptedFiles.length > 1 && onFiles) {
      onFiles(acceptedFiles);
      return;
    }

    const file = acceptedFiles[0];
    // Check if image
    if (file.type.startsWith('image/')) {
      onData(file, 'image');
    } else {
      onData(file, 'file');
    }
  }, [onData, onFiles]);

  const { getRootProps, getInputProps, rootRef } = useDropzone({
    onDrop,
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false),
    accept: {
      'text/csv': ['.csv'],
      'text/plain': ['.txt', '.tsv'],
      'application/xml': ['.xml'],
      'text/xml': ['.xml'],
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
      'application/octet-stream': ['.tlg'] // Assuming .tlg is binary or text, catch-all
    }
  });

  // Auto-focus the dropzone on mount so paste works immediately.
  useEffect(() => {
    rootRef.current?.focus();
  }, [rootRef]);

  const handlePaste = useCallback((e: ClipboardEvent | React.ClipboardEvent) => {
    // Determine clipboard data source
    const clipboardData = (e as ClipboardEvent).clipboardData || (e as React.ClipboardEvent).clipboardData;
    if (!clipboardData) return;

    // 1. Check for image
    const items = Array.from(clipboardData.items);
    const imageItem = items.find(item => item.type.startsWith('image/'));

    if (imageItem) {
      const blob = imageItem.getAsFile();
      if (blob) {
        markPasteDetected();
        onData(blob, 'image');
      }
      return;
    }

    // 2. Check for text
    const text = clipboardData.getData('text/plain');
    if (text && text.trim().length > 0) {
      markPasteDetected();
      onData(text, 'text');
    }
  }, [markPasteDetected, onData]);

  // Global paste listener to catch pastes even if dropzone isn't perfectly focused
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      // Don't intercept if focus is in an input/textarea that is NOT the dropzone
      const isInput = document.activeElement?.tagName === 'INPUT' || 
                      document.activeElement?.tagName === 'TEXTAREA';
      
      // If it's a file input (like the dropzone's internal one), we DO want to catch it if it was triggered by paste
      // But typically we want to catch global pastes when the user is just "on the page"
      if (isInput && document.activeElement !== rootRef.current) return;
      
      handlePaste(e);
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [handlePaste, rootRef]);

  const rootProps = getRootProps();

  return (
    <div
      {...rootProps}
      tabIndex={0}
      onPaste={handlePaste}
      className={`
        border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer outline-none bg-card-bg/60
        ${(isProcessing || pasteDetected) ? 'border-accent bg-accent-light/50 shadow-sm' : isDragActive ? 'border-accent bg-accent-light/30' : 'border-card-border hover:border-accent/50 hover:bg-card-bg'}
      `}
    >
      <input {...getInputProps()} />
      {(isProcessing || pasteDetected) ? (
        <div className="space-y-4">
          <div className="flex justify-center mb-4">
            {isProcessing ? (
              <Loader2 className="w-10 h-10 text-accent animate-spin" />
            ) : (
              <ClipboardCheck className="w-10 h-10 text-accent animate-pulse" />
            )}
          </div>
          <h3 className="text-xl font-bold text-foreground">
            {isProcessing ? 'Analyzing Data...' : 'Paste Received!'}
          </h3>
          <p className="text-muted text-sm italic">This takes about 10-15 seconds for images</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-center gap-3 text-muted group-hover:scale-105 group-hover:text-foreground transition-all">
            <FileText className="w-10 h-10 stroke-[1.5]" />
            <span className="text-xl font-light opacity-40">/</span>
            <ImageIcon className="w-10 h-10 stroke-[1.5]" />
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-bold text-foreground">Drop files here or click to browse</h3>
            <p className="text-muted text-sm max-w-sm mx-auto leading-relaxed">
              Supports <span className="text-foreground font-semibold">CSV, TSV, TXT, XML, TLG, eSignal</span>, URLs, and <span className="text-foreground font-semibold">Screenshots</span> (PNG/JPG).
            </p>
            <p className="text-muted text-xs max-w-sm mx-auto leading-relaxed">
              Drop <span className="text-foreground font-semibold">multiple files at once</span> (e.g. Schwab, Vanguard &amp; IBKR) to merge them into one import.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 pt-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPasteError('');
                // Try to read from clipboard
                if (navigator.clipboard && navigator.clipboard.read) {
                  navigator.clipboard.read().then(async (items) => {
                    for (const item of items) {
                      const imageType = item.types.find(t => t.startsWith('image/'));
                      if (imageType) {
                        const blob = await item.getType(imageType);
                        const extension = imageType.split('/')[1] || 'png';
                        const file = new File([blob], `clipboard-image.${extension}`, { type: imageType });
                        onData(file, 'image');
                        markPasteDetected();
                        return;
                      }
                    }
                    // If no image, try text
                    const text = await navigator.clipboard.readText();
                    if (text) {
                      onData(text, 'text');
                      markPasteDetected();
                    }
                  }).catch(err => {
                    console.error('Failed to read clipboard:', err);
                    setPasteError('Clipboard access was denied. Use Cmd+V or Ctrl+V instead.');
                  });
                } else {
                  setPasteError('Clipboard access is unavailable. Use Cmd+V or Ctrl+V instead.');
                }
              }}
              className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-xl text-sm font-semibold shadow-sm hover:bg-accent/90 transition-all"
            >
              <Clipboard className="w-4 h-4" />
              Paste from Clipboard
            </button>

            <p className="text-xs text-muted">
              <span className="keyboard-shortcut kbd px-1.5 py-0.5 rounded border border-card-border bg-muted-bg text-foreground font-medium">Cmd+V</span> works anywhere too!
            </p>
            {pasteError && (
              <p role="alert" className="text-xs text-loss">
                {pasteError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

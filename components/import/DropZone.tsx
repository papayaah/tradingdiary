'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';

interface DropZoneProps {
  onData: (data: File | string, type: 'file' | 'text' | 'image') => void;
  isProcessing?: boolean;
}

export default function DropZone({ onData, isProcessing }: DropZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [pasteDetected, setPasteDetected] = useState(false);
  const [pasteError, setPasteError] = useState('');
  const dropzoneRef = useRef<HTMLDivElement>(null);

  // Auto-focus the dropzone on mount so paste works immediately
  useEffect(() => {
    dropzoneRef.current?.focus();
  }, []);

  // Reset paste detected when isProcessing finishes
  useEffect(() => {
    if (!isProcessing) {
      setPasteDetected(false);
    }
  }, [isProcessing]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      // Check if image
      if (file.type.startsWith('image/')) {
        onData(file, 'image');
      } else {
        onData(file, 'file');
      }
    }
  }, [onData]);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false),
    accept: {
      'text/csv': ['.csv'],
      'text/plain': ['.txt', '.tsv'],
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
      'application/octet-stream': ['.tlg'] // Assuming .tlg is binary or text, catch-all
    }
  });

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
        setPasteDetected(true);
        onData(blob, 'image');
      }
      return;
    }

    // 2. Check for text
    const text = clipboardData.getData('text/plain');
    if (text && text.trim().length > 0) {
      setPasteDetected(true);
      onData(text, 'text');
    }
  }, [onData]);

  // Global paste listener to catch pastes even if dropzone isn't perfectly focused
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      // Don't intercept if focus is in an input/textarea that is NOT the dropzone
      const isInput = document.activeElement?.tagName === 'INPUT' || 
                      document.activeElement?.tagName === 'TEXTAREA';
      
      // If it's a file input (like the dropzone's internal one), we DO want to catch it if it was triggered by paste
      // But typically we want to catch global pastes when the user is just "on the page"
      if (isInput && document.activeElement !== dropzoneRef.current) return;
      
      handlePaste(e);
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [handlePaste]);

  const rootProps = getRootProps();

  return (
    <div
      {...rootProps}
      ref={(node: HTMLDivElement | null) => {
        // react-dropzone may use a ref callback or a ref object
        if (typeof rootProps.ref === 'function') {
          rootProps.ref(node);
        } else if (rootProps.ref) {
          (rootProps.ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }
        (dropzoneRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      tabIndex={0}
      onPaste={(e) => handlePaste(e as any)}
      className={`
        border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer outline-none
        ${(isProcessing || pasteDetected) ? 'border-primary bg-primary/10 shadow-[0_0_20px_-5px_rgba(var(--primary-rgb),0.3)]' : isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'}
      `}
    >
      <input {...getInputProps()} />
      {(isProcessing || pasteDetected) ? (
        <div className="space-y-4">
          <div className="flex justify-center text-4xl mb-4 animate-bounce">
            {isProcessing ? '⏳' : '📋'}
          </div>
          <h3 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            {isProcessing ? 'Analyzing Data...' : 'Paste Received!'}
          </h3>
          <p className="text-muted text-sm italic">This takes about 10-15 seconds for images</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-center text-5xl mb-2 group-hover:scale-110 transition-transform">
            📄 <span className="mx-2 opacity-50">/</span> 🖼️
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-bold">Drop files here or click to browse</h3>
            <p className="text-muted text-sm max-w-sm mx-auto leading-relaxed">
              Supports <span className="text-foreground font-semibold">CSV, TSV, TXT, TLG, eSignal</span>, URLs, and <span className="text-foreground font-semibold">Screenshots</span> (PNG/JPG).
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
                        setPasteDetected(true);
                        return;
                      }
                    }
                    // If no image, try text
                    const text = await navigator.clipboard.readText();
                    if (text) {
                      onData(text, 'text');
                      setPasteDetected(true);
                    }
                  }).catch(err => {
                    console.error('Failed to read clipboard:', err);
                    setPasteError('Clipboard access was denied. Use Cmd+V or Ctrl+V instead.');
                  });
                } else {
                  setPasteError('Clipboard access is unavailable. Use Cmd+V or Ctrl+V instead.');
                }
              }}
              className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-semibold shadow-lg hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all"
            >
              <span className="text-xl">📋</span>
              Paste from Clipboard
            </button>

            <p className="text-xs text-muted">
              <span className="keyboard-shortcut kbd px-1.5 py-0.5 rounded border border-border bg-muted/30">Cmd+V</span> works anywhere too!
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

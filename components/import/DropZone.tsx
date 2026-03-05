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
  const dropzoneRef = useRef<HTMLDivElement>(null);

  // Auto-focus the dropzone on mount so paste works immediately
  useEffect(() => {
    dropzoneRef.current?.focus();
  }, []);

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
    accept: {
      'text/csv': ['.csv'],
      'text/plain': ['.txt', '.tsv'],
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
      'application/octet-stream': ['.tlg'] // Assuming .tlg is binary or text, catch-all
    }
  });

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    // 1. Check for image
    const items = Array.from(e.clipboardData.items);
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
    const text = e.clipboardData.getData('text/plain');
    if (text && text.trim().length > 0) {
      setPasteDetected(true);
      onData(text, 'text');
    }
  }, [onData]);

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
      onPaste={handlePaste}
      className={`
        border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer outline-none
        ${(isProcessing || pasteDetected) ? 'border-primary bg-primary/10' : isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'}
      `}
    >
      <input {...getInputProps()} />
      {(isProcessing || pasteDetected) ? (
        <div className="space-y-4">
          <div className="flex justify-center text-4xl mb-4">
            {isProcessing ? '⏳' : '📋'}
          </div>
          <h3 className="text-xl font-medium text-primary">
            {isProcessing ? 'Analyzing Data...' : 'Paste received!'}
          </h3>
          <p className="text-muted-foreground text-sm animate-pulse">This will only take a moment</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-center text-4xl mb-4">
            📄 🖼️
          </div>
          <h3 className="text-xl font-medium">Drop files here or click to browse</h3>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Supports CSV, TSV, TXT, TLG (legacy), and Screenshots (PNG/JPG).
            <br />
            <span className="font-semibold text-foreground">Tip:</span> You can also <span className="keyboard-shortcut kbd">Ctrl+V</span> / <span className="keyboard-shortcut kbd">Cmd+V</span> to paste data directly!
          </p>
        </div>
      )}
    </div>
  );
}

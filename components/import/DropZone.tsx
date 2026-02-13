'use client';

import { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';

interface DropZoneProps {
  onData: (data: File | string, type: 'file' | 'text' | 'image') => void;
}

export default function DropZone({ onData }: DropZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const dropzoneRef = useRef<HTMLDivElement>(null);

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
      if (blob) onData(blob, 'image');
      return;
    }

    // 2. Check for text
    const text = e.clipboardData.getData('text/plain');
    if (text && text.trim().length > 0) {
      onData(text, 'text');
    }
  }, [onData]);

  // Focus the div on mount to capture paste events? 
  // Probably better if the user clicks inside, but we can try to make it focusable.

  return (
    <div
      {...getRootProps()}
      onPaste={handlePaste}
      className={`
        border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer outline-none
        ${isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'}
      `}
    >
      <input {...getInputProps()} />
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
    </div>
  );
}

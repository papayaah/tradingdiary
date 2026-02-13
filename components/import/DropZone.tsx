'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface DropZoneProps {
  onFileSelected: (file: File) => Promise<void>;
}

type Status = 'idle' | 'dragover' | 'processing' | 'success' | 'error';

export default function DropZone({ onFileSelected }: DropZoneProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [fileName, setFileName] = useState('');
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.tlg')) {
        setStatus('error');
        setMessage('Please select a .tlg file');
        return;
      }
      setFileName(file.name);
      setStatus('processing');
      setMessage('Parsing and importing trades...');
      try {
        await onFileSelected(file);
        setStatus('success');
        setMessage('Trades imported successfully!');
      } catch (e) {
        setStatus('error');
        setMessage(e instanceof Error ? e.message : 'Import failed');
      }
    },
    [onFileSelected]
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setStatus('dragover');
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setStatus('idle');
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const statusIcon = {
    idle: <Upload size={40} className="text-muted" />,
    dragover: <Upload size={40} className="text-accent" />,
    processing: <Loader2 size={40} className="text-accent animate-spin" />,
    success: <CheckCircle2 size={40} className="text-profit" />,
    error: <XCircle size={40} className="text-loss" />,
  };

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => status !== 'processing' && inputRef.current?.click()}
      className={`relative flex flex-col items-center justify-center gap-4 p-12 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
        status === 'dragover'
          ? 'border-accent bg-accent-light scale-[1.01]'
          : status === 'success'
          ? 'border-profit bg-profit/5'
          : status === 'error'
          ? 'border-loss bg-loss/5'
          : 'border-card-border bg-card-bg hover:border-muted'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".tlg"
        className="hidden"
        onChange={onInputChange}
      />

      {statusIcon[status]}

      {fileName && (
        <div className="flex items-center gap-2 text-sm text-foreground">
          <FileText size={16} />
          <span className="font-medium">{fileName}</span>
        </div>
      )}

      <div className="text-center">
        {status === 'idle' || status === 'dragover' ? (
          <>
            <p className="text-sm font-medium text-foreground">
              Drop your .tlg file here
            </p>
            <p className="text-xs text-muted mt-1">
              or click to browse
            </p>
          </>
        ) : (
          <p
            className={`text-sm font-medium ${
              status === 'success'
                ? 'text-profit'
                : status === 'error'
                ? 'text-loss'
                : 'text-muted'
            }`}
          >
            {message}
          </p>
        )}
      </div>

      {status === 'success' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setStatus('idle');
            setFileName('');
            setMessage('');
          }}
          className="text-xs text-accent hover:underline"
        >
          Import another file
        </button>
      )}
    </div>
  );
}

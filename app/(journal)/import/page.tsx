'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
import DropZone from '@/components/import/DropZone';
import { parseTLGFile } from '@/lib/parser/tlg-parser';
import { importData } from '@/lib/db/trades';

export default function ImportPage() {
  const router = useRouter();
  const [importCount, setImportCount] = useState<number | null>(null);

  const handleFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseTLGFile(text);
    await importData(parsed.account, parsed.transactions, parsed.positions);
    setImportCount(parsed.transactions.length);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-full p-8">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent-light mb-2">
            <Upload size={24} className="text-accent" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Import Trades</h1>
          <p className="text-sm text-muted">
            Import your trading data from a .tlg file exported from your broker.
          </p>
        </div>

        <DropZone onFileSelected={handleFile} />

        {importCount !== null && (
          <div className="flex flex-col items-center gap-3 pt-2">
            <p className="text-sm text-muted">
              <span className="font-semibold text-foreground">{importCount}</span>{' '}
              transactions imported
            </p>
            <button
              onClick={() => router.push('/journal')}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              View Journal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

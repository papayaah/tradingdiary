'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DropZone from '@/components/import/DropZone';
import ColumnMapper from '@/components/import/ColumnMapper';
import ImportPreview from '@/components/import/ImportPreview';
import { useAIManagementContextOptional } from '@/packages/ai-connect/src/components';
import { parseCSVOrText } from '@/lib/import/csv-extractor';
import { mapColumnsWithLLM } from '@/lib/import/llm-mapper';
import { mapColumnsOffline } from '@/lib/import/alias-mapper';
import { NormalizedTransaction, ColumnMapping, SideValueMapping } from '@/lib/import/types';

export default function ImportPage() {
  const router = useRouter();
  const aiContext = useAIManagementContextOptional();
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for the import flow
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({} as any);
  const [sideMap, setSideMap] = useState<SideValueMapping>({});
  const [previewTransactions, setPreviewTransactions] = useState<NormalizedTransaction[]>([]);



  // Helper to process rows with a given mapping
  const processRowsWithMapping = (
    currentMapping: ColumnMapping,
    currentSideMap: SideValueMapping,
    currentRows: Record<string, string>[]
  ) => {
    return currentRows.map((row, idx) => {
      const get = (key: keyof NormalizedTransaction) => {
        const header = currentMapping[key];
        return header ? row[header] : undefined;
      };

      const rawSide = get('side');
      let side: 'BUY' | 'SELL' = 'BUY';
      if (rawSide) {
        const s = rawSide.trim();
        if (currentSideMap[s]) side = currentSideMap[s];
        else if (/buy|long|b/i.test(s)) side = 'BUY';
        else if (/sell|short|s/i.test(s)) side = 'SELL';
      }

      const qty = parseFloat(get('quantity')?.replace(/,/g, '') || '0');
      const price = parseFloat(get('price')?.replace(/,/g, '') || '0');

      return {
        date: get('date') || new Date().toISOString().split('T')[0],
        time: get('time'),
        symbol: get('symbol') || 'UNKNOWN',
        side,
        quantity: Math.abs(qty),
        price: Math.abs(price),
        orderId: get('orderId'),
        currency: get('currency'),
        totalValue: get('totalValue') ? parseFloat(get('totalValue')!.replace(/,/g, '')) : undefined,
      };
    });
  };

  const handleData = async (data: File | string, type: 'file' | 'text' | 'image') => {
    setLoading(true);
    setError(null);

    try {
      let parsedHeaders: string[] = [];
      let parsedRows: Record<string, string>[] = [];

      // 1. Extract Data (Text vs Image)
      if (type === 'image') {
        const apiKey = aiContext?.config?.customLLM?.apiKey;
        if (!apiKey) {
          setError("You need an API Key (OpenRouter) in Settings to use Image Import.");
          setLoading(false);
          return;
        }

        let base64Image = '';
        if (data instanceof File) {
          const { fileToBase64 } = await import('@/lib/import/image-extractor');
          base64Image = await fileToBase64(data);
        } else {
          if (typeof data === 'string') {
            base64Image = data;
          }
        }

        const { extractFromImage } = await import('@/lib/import/image-extractor');
        const result = await extractFromImage(base64Image, apiKey);
        parsedHeaders = result.headers;
        parsedRows = result.rows;

      } else {
        // CSV / Text
        let content = '';
        if (data instanceof File) {
          content = await data.text();
        } else {
          content = data as string;
        }

        const result = await parseCSVOrText(content);
        parsedHeaders = result.headers;
        parsedRows = result.rows;
      }

      if (parsedHeaders.length === 0 || parsedRows.length === 0) {
        setError("No data found.");
        setLoading(false);
        return;
      }

      setHeaders(parsedHeaders);
      setRows(parsedRows);

      // 2. Map columns (Try LLM -> Fallback Offline)
      let detectedMapping: ColumnMapping = {} as any;
      let detectedSideMap: SideValueMapping = {};

      const apiKey = aiContext?.config?.customLLM?.apiKey;

      if (apiKey) {
        try {
          const response = await mapColumnsWithLLM(parsedHeaders, parsedRows.slice(0, 3), apiKey);
          detectedMapping = response.mapping as ColumnMapping;
          detectedSideMap = response.sideValues || {};
        } catch (err) {
          console.warn('LLM mapping failed, falling back to offline:', err);
          detectedMapping = mapColumnsOffline(parsedHeaders);
        }
      } else {
        detectedMapping = mapColumnsOffline(parsedHeaders);
      }

      setMapping(detectedMapping);
      setSideMap(detectedSideMap);

      // 3. Check if we have all required fields to Auto-Skip
      const requiredFields: (keyof NormalizedTransaction)[] = ['date', 'symbol', 'side', 'quantity', 'price'];
      const hasAllRequired = requiredFields.every(field => detectedMapping[field]);

      if (hasAllRequired) {
        // Auto-advance to preview
        try {
          const normalized = processRowsWithMapping(detectedMapping, detectedSideMap, parsedRows);
          setPreviewTransactions(normalized);
          setStep('preview');
        } catch (err) {
          console.error("Auto-conversion failed", err);
          setStep('mapping'); // Fallback to mapping UI on error
        }
      } else {
        setStep('mapping');
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to process import");
    } finally {
      setLoading(false);
    }
  };

  const handleMappingConfirm = (finalMapping: ColumnMapping, finalSideMap: SideValueMapping) => {
    try {
      const normalized = processRowsWithMapping(finalMapping, finalSideMap, rows);
      setPreviewTransactions(normalized);
      setStep('preview');
    } catch (err) {
      console.error(err);
      setError("Failed to transform data");
    }
  };

  const handleImport = async () => {
    setLoading(true);
    try {
      // Lazy import converter and DB to avoid circular deps or server/client issues if any
      const { toTransactionRecord } = await import('@/lib/import/converter');
      const { importData } = await import('@/lib/db/trades');
      // Note: importData expects AccountRecord. We need to create or select one.
      // For Phase 1, let's create a "Default Import" account or ask user.
      // We'll auto-generate one for now.

      const accountId = `import-${Date.now()}`;
      const account = {
        accountId,
        name: `Import ${new Date().toLocaleDateString()}`,
        type: 'csv',
        address: '',
        importedAt: Date.now(),
      };

      const transactions = previewTransactions.map((t, i) =>
        toTransactionRecord(t, accountId, i)
      );

      // positions calculation is skipped for Phase 1 as per spec (requires full history)
      // We pass empty positions array.
      await importData(account, transactions, []);

      alert(`Successfully imported ${transactions.length} trades to account "${account.name}"!`);

      // Reset
      setStep('upload');
      setHeaders([]);
      setRows([]);
      setPreviewTransactions([]);
    } catch (err: any) {
      console.error('Import failed', err);
      alert(`Import failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-5xl">
      <h1 className="text-3xl font-bold mb-8">Import Trades</h1>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 border border-red-200">
          ⚠️ {error}
        </div>
      )}

      {step === 'upload' && (
        <>
          <DropZone onData={handleData} />
          {loading && <p className="text-center mt-4 text-muted-foreground animate-pulse">Analyzing file...</p>}
        </>
      )}

      {step === 'mapping' && (
        <ColumnMapper
          headers={headers}
          sampleRows={rows}
          initialMapping={mapping}
          initialSideMap={sideMap}
          onConfirm={handleMappingConfirm}
          onCancel={() => setStep('upload')}
        />
      )}

      {step === 'preview' && (
        <ImportPreview
          transactions={previewTransactions}
          onConfirm={handleImport}
          onBack={() => setStep('upload')} // Back now goes to upload, Edit Mapping goes to mapping
          onEditMapping={() => setStep('mapping')}
          isImporting={loading}
        />
      )}
    </div>
  );
}

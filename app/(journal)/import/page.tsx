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
import { parseTLGFile } from '@/lib/parser/tlg-parser';
import { importData } from '@/lib/db/trades';
import { NormalizedTransaction, ColumnMapping, SideValueMapping } from '@/lib/import/types';
import { importFileToLibrary } from '@/packages/react-media-library/src/services/storage';
import { normalizeDate, normalizeTime } from '@/lib/import/normalizer';

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
  const [importFile, setImportFile] = useState<File | null>(null);



  // Helper to process rows with a given mapping
  const processRowsWithMapping = (
    currentMapping: ColumnMapping,
    currentSideMap: SideValueMapping,
    currentRows: Record<string, string>[]
  ) => {
    return currentRows.map((row, idx) => {
      const get = (key: keyof NormalizedTransaction) => {
        const header = currentMapping[key];
        const val = header ? row[header] : undefined;
        return val === '' ? undefined : val;
      };

      const parseAmount = (val: string | undefined): number => {
        if (!val) return 0;
        let clean = val.replace(/[$,()]/g, '').trim();
        let multiplier = 1;
        if (clean.toUpperCase().endsWith('K')) {
          multiplier = 1000;
          clean = clean.slice(0, -1);
        } else if (clean.toUpperCase().endsWith('M')) {
          multiplier = 1000000;
          clean = clean.slice(0, -1);
        }
        const num = parseFloat(clean);
        // Handle negative amounts indicated by parentheses (e.g., ($134) -> -134)
        const isNegative = val.includes('(') && val.includes(')');
        return (isNaN(num) ? 0 : num * multiplier) * (isNegative ? -1 : 1);
      };

      const rawSide = get('side');
      let side: 'BUY' | 'SELL' = 'BUY';
      if (rawSide) {
        const s = rawSide.trim();
        if (currentSideMap[s]) side = currentSideMap[s];
        else if (/buy|long|b/i.test(s)) side = 'BUY';
        else if (/sell|short|s/i.test(s)) side = 'SELL';
      }

      const cleanSymbol = (val: string | undefined): string => {
        if (!val) return 'UNKNOWN';
        // Handle formats like "730283097+NQ(NQ)" or "445423543+U(U)"
        // Prioritize part inside parentheses, then part after '+', then the whole thing
        let match = val.match(/\(([^)]+)\)/); // Look for (...)
        if (match) return match[1].toUpperCase();

        match = val.match(/\+([^()]+)/); // Look for +...
        if (match) return match[1].toUpperCase();

        return val.trim().toUpperCase();
      };

      const qty = parseAmount(get('quantity'));
      const price = parseAmount(get('price'));
      const pnl = parseAmount(get('realizedPnL'));
      const total = get('totalValue') ? parseAmount(get('totalValue')) : undefined;

      const symbol = cleanSymbol(get('symbol'));

      return {
        date: normalizeDate(get('date') || new Date().toISOString().split('T')[0]),
        time: normalizeTime(get('time') || '00:00:00'),
        symbol: symbol,
        side,
        quantity: Math.abs(qty),
        price: Math.abs(price),
        orderId: get('orderId'),
        companyName: symbol,
        currency: get('currency') || 'USD',
        totalValue: total,
        realizedPnL: pnl,
      };
    });
  };

  const handleData = async (data: File | string, type: 'file' | 'text' | 'image') => {
    setLoading(true);
    setError(null);

    try {
      // Detect TLG format and use dedicated parser (skip column mapping entirely)
      if (type !== 'image') {
        let content = '';
        if (data instanceof File) {
          content = await data.text();
        } else {
          content = data as string;
        }

        if (content.includes('ACT_INF|') && content.includes('STK_TRD|')) {
          const parsed = parseTLGFile(content);
          await importData(parsed.account, parsed.transactions, parsed.positions);
          // Save original file to media library
          const fileToSave = data instanceof File
            ? data
            : new File([content], 'pasted-import.tlg', { type: 'text/plain' });
          importFileToLibrary(fileToSave).catch(console.error);
          router.push('/journal');
          return;
        }
      }

      let parsedHeaders: string[] = [];
      let parsedRows: Record<string, string>[] = [];

      // Store original file for later archival
      if (data instanceof File) {
        setImportFile(data);
      } else if (typeof data === 'string') {
        const ext = type === 'image' ? 'png' : 'txt';
        setImportFile(new File([data], `pasted-import.${ext}`, { type: type === 'image' ? 'image/png' : 'text/plain' }));
      }

      // Build LLM config from user's BYOK settings
      const llmConfig = aiContext?.config?.customLLM;

      // 1. Extract Data (Text vs Image)
      if (type === 'image') {
        if (!llmConfig?.apiKey) {
          setError("You need an API Key in Settings to use Image Import.");
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
        const result = await extractFromImage(base64Image, llmConfig);

        // Record usage for cost tracking
        if (result.usage && aiContext?.recordUsage) {
          aiContext.recordUsage(
            (llmConfig.provider as any) || 'google',
            llmConfig.model || 'gemini-1.5-flash',
            {
              inputTokens: result.usage.promptTokens ?? 0,
              outputTokens: result.usage.completionTokens ?? 0,
              totalTokens: result.usage.totalTokens ?? 0
            }
          );
        }

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

      if (llmConfig?.apiKey) {
        try {
          const response = await mapColumnsWithLLM(parsedHeaders, parsedRows.slice(0, 3), llmConfig);
          detectedMapping = response.mapping as ColumnMapping;
          detectedSideMap = response.sideValues || {};

          // Record usage for cost tracking
          if (response.usage && aiContext?.recordUsage) {
            aiContext.recordUsage(
              (llmConfig.provider as any) || 'google',
              llmConfig.model || 'gemini-1.5-flash',
              {
                inputTokens: response.usage.promptTokens,
                outputTokens: response.usage.completionTokens,
                totalTokens: response.usage.totalTokens
              }
            );
          }
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
      const hasStandardInfo = !!(detectedMapping.symbol && detectedMapping.quantity && detectedMapping.price);
      const hasPnLInfo = !!(detectedMapping.symbol && detectedMapping.realizedPnL);
      const hasAllRequired = hasStandardInfo || hasPnLInfo;

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

      // Save original file to media library
      if (importFile) {
        importFileToLibrary(importFile).catch(console.error);
      }

      alert(`Successfully imported ${transactions.length} trades to account "${account.name}"!`);

      // Reset
      setStep('upload');
      setHeaders([]);
      setRows([]);
      setPreviewTransactions([]);
      setImportFile(null);
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

'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
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
import { useImport } from '@/contexts/ImportContext';

export default function ImportPage() {
  const router = useRouter();
  const aiContext = useAIManagementContextOptional();
  const {
    step, setStep,
    headers, updateData,
    rows,
    mapping, setMapping,
    sideMap, setSideMap,
    previewTransactions, setPreviewTransactions,
    importFile, setImportFile,
    isProcessing,
    error, setError,
    startProcessing,
    clearImportState
  } = useImport();

  const processRowsWithMapping = (
    currentMapping: ColumnMapping,
    currentSideMap: SideValueMapping,
    currentRows: Record<string, string>[]
  ): NormalizedTransaction[] => {
    const get = (field: keyof ColumnMapping) => {
      const col = currentMapping[field];
      return col ? currentRows[0][col] : undefined; // This logic is slightly flawed in the old version (it only checks first row for existence? No, it's used inside a map)
    };

    return currentRows.flatMap((row) => {
      const get = (field: keyof ColumnMapping): string | undefined => {
        const header = currentMapping[field];
        return header ? row[header] : undefined;
      };

      const parseAmount = (val: string | undefined): number => {
        if (!val) return 0;
        const clean = val.replace(/[$,\s]/g, '');
        const multiplier = val.includes('%') ? 0.01 : 1;
        const num = parseFloat(clean);
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
        let match = val.match(/\(([^)]+)\)/);
        if (match) return match[1].toUpperCase();
        match = val.match(/\+([^()]+)/);
        if (match) return match[1].toUpperCase();
        return val.trim().toUpperCase();
      };

      const normalizeDate = (val: string | undefined): string => {
        const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
        if (!val) return today;
        const clean = val.trim();
        const digitsOnly = clean.replace(/[-/]/g, '');
        if (/^\d{8}$/.test(digitsOnly)) return digitsOnly;
        const isoMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (isoMatch) return `${isoMatch[1]}${isoMatch[2].padStart(2, '0')}${isoMatch[3].padStart(2, '0')}`;
        const slashMatch = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
        if (slashMatch) {
          let year = slashMatch[3];
          let part1 = slashMatch[1].padStart(2, '0');
          let part2 = slashMatch[2].padStart(2, '0');
          if (parseInt(part1) > 12) return `${year}${part2}${part1}`;
          return `${year}${part1}${part2}`;
        }
        return today;
      };

      const rawSymbol = get('symbol');
      const companyName = get('companyName');

      if (!rawSymbol || rawSymbol.trim() === '' || /total|summary|grand/i.test(rawSymbol)) return [];
      if (companyName && /total\b|grand\s*total|all\s*assets/i.test(companyName)) return [];

      const symbol = cleanSymbol(rawSymbol);
      const qty = parseAmount(get('quantity'));
      const price = parseAmount(get('price'));
      const pnl = parseAmount(get('realizedPnL'));
      const total = get('totalValue') ? parseAmount(get('totalValue')) : undefined;

      return [{
        date: normalizeDate(get('date')),
        time: get('time') || '00:00:00',
        symbol: symbol,
        side,
        quantity: Math.abs(qty),
        price: Math.abs(price),
        orderId: get('orderId'),
        companyName: companyName ? cleanSymbol(companyName) : symbol,
        currency: get('currency') || 'USD',
        totalValue: total,
        realizedPnL: pnl,
        unrealizedPnL: parseAmount(get('unrealizedPnL')),
      }];
    });
  };

  const handleData = (data: File | string, type: 'file' | 'text' | 'image') => {
    startProcessing(async () => {
      // TLG Quick Path
      if (type !== 'image') {
        let content = '';
        if (data instanceof File) content = await data.text();
        else content = data as string;

        if (content.includes('ACT_INF|') && content.includes('STK_TRD|')) {
          const parsed = parseTLGFile(content);
          await importData(parsed.account, parsed.transactions, parsed.positions);
          const fileToSave = data instanceof File ? data : new File([content], 'pasted-import.tlg', { type: 'text/plain' });
          importFileToLibrary(fileToSave).catch(console.error);
          toast.success("TLG Import Successful");
          router.push('/journal');
          return;
        }
      }

      let parsedHeaders: string[] = [];
      let parsedRows: Record<string, string>[] = [];

      if (data instanceof File) setImportFile(data);
      else if (typeof data === 'string') {
        const ext = type === 'image' ? 'png' : 'txt';
        setImportFile(new File([data], `pasted-import.${ext}`, { type: type === 'image' ? 'image/png' : 'text/plain' }));
      }

      const llmConfig = aiContext?.config?.customLLM;

      if (type === 'image') {
        if (!llmConfig?.apiKey) throw new Error("API Key required for image import");
        let base64Image = '';
        if (data instanceof File) {
          const { fileToBase64 } = await import('@/lib/import/image-extractor');
          base64Image = await fileToBase64(data);
        } else base64Image = data;

        const { extractFromImage } = await import('@/lib/import/image-extractor');
        const result = await extractFromImage(base64Image, llmConfig);

        if (result.usage && aiContext?.recordUsage) {
          aiContext.recordUsage(llmConfig.provider || 'google', llmConfig.model || 'gemini-1.5-flash', {
            inputTokens: result.usage.promptTokens,
            outputTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens
          });
        }
        parsedHeaders = result.headers;
        parsedRows = result.rows;
      } else {
        let content = '';
        if (data instanceof File) content = await data.text();
        else content = data as string;
        const result = await parseCSVOrText(content);
        parsedHeaders = result.headers;
        parsedRows = result.rows;
      }

      if (parsedHeaders.length === 0 || parsedRows.length === 0) throw new Error("No data found");

      updateData(parsedHeaders, parsedRows);

      // LLM Mapping
      let detectedMapping: ColumnMapping = {} as any;
      let detectedSideMap: SideValueMapping = {};

      if (llmConfig?.apiKey) {
        try {
          const response = await mapColumnsWithLLM(parsedHeaders, parsedRows.slice(0, 3), llmConfig);
          detectedMapping = response.mapping as ColumnMapping;
          detectedSideMap = response.sideValues || {};
          if (response.usage && aiContext?.recordUsage) {
            aiContext.recordUsage(llmConfig.provider || 'google', llmConfig.model || 'gemini-1.5-flash', {
              inputTokens: response.usage.promptTokens,
              outputTokens: response.usage.completionTokens,
              totalTokens: response.usage.totalTokens
            });
          }
        } catch (err) {
          detectedMapping = mapColumnsOffline(parsedHeaders);
        }
      } else {
        detectedMapping = mapColumnsOffline(parsedHeaders);
      }

      setMapping(detectedMapping);
      setSideMap(detectedSideMap);

      const hasRequired = (detectedMapping.symbol && detectedMapping.quantity && detectedMapping.price) || (detectedMapping.symbol && detectedMapping.realizedPnL);

      if (hasRequired) {
        const normalized = processRowsWithMapping(detectedMapping, detectedSideMap, parsedRows);
        setPreviewTransactions(normalized);
        setStep('preview');
      } else {
        setStep('mapping');
      }
    });
  };

  const handleMappingConfirm = (finalMapping: ColumnMapping, finalSideMap: SideValueMapping) => {
    try {
      const normalized = processRowsWithMapping(finalMapping, finalSideMap, rows);
      setPreviewTransactions(normalized);
      setStep('preview');
    } catch (err) {
      setError("Failed to transform data");
    }
  };

  const handleImport = async (selectedTransactions: NormalizedTransaction[]) => {
    startProcessing(async () => {
      const { toTransactionRecord } = await import('@/lib/import/converter');
      const { importData: dbImport } = await import('@/lib/db/trades');

      const accountId = `import-${Date.now()}`;
      const account = {
        accountId,
        name: `Import ${new Date().toLocaleDateString()}`,
        type: 'csv',
        address: '',
        importedAt: Date.now(),
      };

      const transactions = selectedTransactions.map((t, i) => toTransactionRecord(t, accountId, i));
      await dbImport(account, transactions, []);

      if (importFile) importFileToLibrary(importFile).catch(console.error);

      toast.success(`Successfully imported ${transactions.length} trades!`, {
        description: `Imported to account "${account.name}"`,
      });

      clearImportState();
      router.push('/journal');
    });
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Import Trades</h1>
        <p className="text-muted mt-2">
          Upload CSV, TLG, or drop a screenshot of your trade history.
        </p>
      </div>

      {step === 'upload' && (
        <div className="space-y-6">
          <DropZone onData={handleData} isProcessing={isProcessing} />
          {error && (
            <div className="p-4 bg-loss/10 border border-loss/20 rounded-lg text-loss text-sm text-center">
              {error}
            </div>
          )}
        </div>
      )}

      {step === 'mapping' && (
        <ColumnMapper
          headers={headers}
          sampleRows={rows.slice(0, 5)}
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
          onBack={() => setStep('mapping')}
          isImporting={isProcessing}
        />
      )}

      {isProcessing && step !== 'upload' && step !== 'preview' && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
          <p className="mt-4 font-medium">Analyzing your trades...</p>
          <p className="text-xs text-muted mt-1">This takes about 10-15 seconds</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-8 text-sm text-accent hover:underline"
          >
            You can view your dashboard while we finish this.
          </button>
        </div>
      )}
    </div>
  );
}

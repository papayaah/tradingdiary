'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import DropZone from '@/components/import/DropZone';
import ColumnMapper from '@/components/import/ColumnMapper';
import ImportPreview from '@/components/import/ImportPreview';
import IBKRExportGuide from '@/components/import/IBKRExportGuide';
import { useAIManagementContextOptional } from '@/packages/ai-connect/src/components';
import { parseCSVOrText } from '@/lib/import/utils/csv-extractor';
import { mapColumnsWithLLM } from '@/lib/import/utils/llm-mapper';
import { mapColumnsOffline } from '@/lib/import/alias-mapper';
import { detectAndParseBroker } from '@/lib/import/registry';
import { inferBrokerName } from '@/lib/import/broker-name';
import { getAccounts } from '@/lib/db/trades';
import { NormalizedTransaction, ColumnMapping, SideValueMapping } from '@/lib/import/types';
import { importFileToLibrary } from '@/packages/react-media-library/src/services/storage';
import { useImport } from '@/contexts/ImportContext';
import { detectCurrency } from '@/lib/import/utils/currency-detector';
import { AccountRecord } from '@/lib/db/schema';
import { useState, useEffect } from 'react';
import { useAccount } from '@/contexts/AccountContext';
import { normalizeDate, normalizeTime } from '@/lib/import/utils/normalizer';
import { Link as LinkIcon, Cpu } from 'lucide-react';
import { getProvider } from '@/packages/ai-connect/src/providers';
import type { LLMProvider } from '@/packages/ai-connect/src/types';

// Drop only exact-duplicate rows (same trade appearing in two dropped files).
// The full composite key avoids cross-broker orderId collisions dropping
// distinct trades that happen to share an order number.
const dedupeTransactions = (txs: NormalizedTransaction[]): NormalizedTransaction[] => {
  const seen = new Set<string>();
  const out: NormalizedTransaction[] = [];
  for (const t of txs) {
    const key = [
      t.orderId ?? '',
      t.date,
      t.time ?? '',
      t.symbol,
      t.side,
      t.quantity,
      t.price,
      t.realizedPnL ?? '',
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
};

export default function TradeImportWorkspace() {
  const router = useRouter();
  const aiContext = useAIManagementContextOptional();
  const { refreshAccounts } = useAccount();
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);

  const {
    step, setStep,
    headers, updateData,
    rows,
    mapping, setMapping,
    sideMap, setSideMap,
    previewTransactions, setPreviewTransactions,
    importFile, setImportFile,
    isProcessing,
    detectedCurrency, setDetectedCurrency,
    detectedBrokerName, setDetectedBrokerName,
    error, setError,
    startProcessing,
    clearImportState
  } = useImport();

  useEffect(() => {
    getAccounts().then(setAccounts);
  }, [step]); // Refetch when step changes or on mount

  const processRowsWithMapping = (
    currentMapping: ColumnMapping,
    currentSideMap: SideValueMapping,
    currentRows: Record<string, string>[]
  ): NormalizedTransaction[] => {
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
      const qty = parseAmount(get('quantity'));
      let side: 'BUY' | 'SELL' = 'BUY';
      if (rawSide && rawSide.trim()) {
        const s = rawSide.trim();
        if (currentSideMap[s]) side = currentSideMap[s];
        else if (/buy|long|b/i.test(s)) side = 'BUY';
        else if (/sell|short|s/i.test(s)) side = 'SELL';
      } else if (qty < 0) {
        side = 'SELL';
      }

      const cleanSymbol = (val: string | undefined): string => {
        if (!val) return 'UNKNOWN';
        let match = val.match(/\(([^)]+)\)/);
        if (match) return match[1].toUpperCase();
        match = val.match(/\+([^()]+)/);
        if (match) return match[1].toUpperCase();
        return val.trim().toUpperCase();
      };

      const rawSymbol = get('symbol');
      const companyName = get('companyName');

      if (!rawSymbol || rawSymbol.trim() === '' || /total|summary|grand/i.test(rawSymbol)) return [];
      if (companyName && /total\b|grand\s*total|all\s*assets/i.test(companyName)) return [];

      const symbol = cleanSymbol(rawSymbol);
      const price = parseAmount(get('price'));
      const pnl = parseAmount(get('realizedPnL'));
      const total = get('totalValue') ? parseAmount(get('totalValue')) : undefined;

      return [{
        date: normalizeDate(get('date') || new Date().toISOString().split('T')[0]),
        time: normalizeTime(get('time') || '00:00:00'),
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
      setDetectedBrokerName(null);
      setDetectedCurrency(null);
      let processedData = data;
      let processedType = type;

      // URL Detection Path
      if (typeof data === 'string' && /^https?:\/\//i.test(data.trim())) {
        try {
          const url = data.trim();
          const response = await fetch(`/api/fetch-url?url=${encodeURIComponent(url)}`);
          if (!response.ok) throw new Error("Failed to fetch from URL");
          
          const contentType = response.headers.get('content-type') || '';
          if (contentType.startsWith('image/')) {
            const blob = await response.blob();
            processedData = new File([blob], url.split('/').pop() || 'image', { type: contentType });
            processedType = 'image';
          } else {
            const content = await response.text();
            const filename = url.split('/').pop() || 'imported-data';
            processedData = new File([content], filename, { type: 'text/plain' });
            processedType = 'file';
          }
        } catch {
          setError("Could not fetch from URL. Make sure it's public.");
          return;
        }
      }

      // Broker-specific formats take precedence over the generic column mapper.
      if (processedType !== 'image') {
        let content = '';
        if (processedData instanceof File) content = await processedData.text();
        else content = processedData as string;

        const brokerSource = {
          content,
          filename: processedData instanceof File ? processedData.name : undefined,
        };
        const brokerImport = await detectAndParseBroker(brokerSource);
        if (brokerImport) {
          if (brokerImport.transactions.length === 0) {
            throw new Error(`${brokerImport.brokerName} format detected, but no supported completed trades were found.`);
          }

          setPreviewTransactions(brokerImport.transactions);
          setDetectedBrokerName(brokerImport.brokerName);
          setStep('preview');
          const currency = brokerImport.transactions.find((transaction) => transaction.currency)?.currency;
          if (currency) setDetectedCurrency(currency);

          const fileToSave = processedData instanceof File
            ? processedData
            : new File([content], `pasted-${brokerImport.brokerId}-import.txt`, { type: 'text/plain' });
          importFileToLibrary(fileToSave).catch(console.error);
          toast.success(`Detected ${brokerImport.brokerName} ${brokerImport.format}.`);
          brokerImport.warnings.forEach((warning) => toast.warning(warning));
          return;
        }
        setDetectedBrokerName(inferBrokerName(brokerSource));
      }

      let parsedHeaders: string[] = [];
      let parsedRows: Record<string, string>[] = [];

      if (processedData instanceof File) setImportFile(processedData);
      else if (typeof processedData === 'string') {
        const ext = processedType === 'image' ? 'png' : 'txt';
        setImportFile(new File([processedData], `pasted-import.${ext}`, { type: processedType === 'image' ? 'image/png' : 'text/plain' }));
      }

      const config = aiContext?.config;

      const activeProvider = config?.customLLM?.provider;
      const activeKey = config?.customLLM?.apiKey;
      const activeModel = config?.customLLM?.model;

      if (processedType === 'image') {
        // If it's an image, we need vision.
        if (!activeKey && config?.type !== 'hosted-api') {
          throw new Error("API Key required for image import. Please configure it in Settings.");
        }

        let base64Image = '';
        if (processedData instanceof File) {
          const { fileToBase64 } = await import('@/lib/import/utils/image-extractor');
          base64Image = await fileToBase64(processedData);
        } else base64Image = processedData as string;

        const { extractFromImage } = await import('@/lib/import/utils/image-extractor');
        const result = await extractFromImage(base64Image, {
          apiKey: activeKey || 'SERVER_MANAGED',
          provider: activeProvider,
          model: activeModel
        });

        if (result.usage && aiContext?.recordUsage) {
          aiContext.recordUsage(
            (activeProvider as LLMProvider) || 'google',
            activeModel || 'gemini-1.5-flash',
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
        let content = '';
        if (processedData instanceof File) content = await processedData.text();
        else content = processedData as string;
        const result = await parseCSVOrText(content);
        parsedHeaders = result.headers;
        parsedRows = result.rows;
      }

      if (parsedHeaders.length === 0 || parsedRows.length === 0) throw new Error("No data found");

      updateData(parsedHeaders, parsedRows);

      // Auto-detect currency
      const detected = detectCurrency(parsedHeaders, parsedRows);
      if (detected) setDetectedCurrency(detected);

      // LLM Mapping
      let detectedMapping = {} as ColumnMapping;
      let detectedSideMap: SideValueMapping = {};

      if (activeKey) {
        try {
          const response = await mapColumnsWithLLM(parsedHeaders, parsedRows.slice(0, 3), {
            apiKey: activeKey,
            provider: activeProvider,
            model: activeModel
          });
          detectedMapping = response.mapping as ColumnMapping;
          detectedSideMap = response.sideValues || {};
          if (response.usage && aiContext?.recordUsage) {
            aiContext.recordUsage(activeProvider || 'google', activeModel || 'gemini-1.5-flash', {
              inputTokens: response.usage.promptTokens,
              outputTokens: response.usage.completionTokens,
              totalTokens: response.usage.totalTokens
            });
          }
        } catch {
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

  // Parse a single already-read file into normalized transactions, trying
  // broker-specific adapters first and falling back to the generic column
  // mapper. Returns null when the file can't be auto-mapped (caller warns).
  const parseFileForMerge = async (
    file: File,
    content: string,
    ai: {
      provider?: LLMProvider;
      apiKey?: string;
      model?: string;
    },
  ): Promise<
    | { transactions: NormalizedTransaction[]; brokerName: string; currency: string | null }
    | { skippedReason: string }
  > => {
    const brokerSource = { content, filename: file.name };

    // 1. Broker-specific formats (IBKR, Schwab, Fidelity, Robinhood, Webull, eSignal).
    const brokerImport = await detectAndParseBroker(brokerSource);
    if (brokerImport) {
      if (brokerImport.transactions.length === 0) {
        return { skippedReason: `${file.name} (${brokerImport.brokerName}: no completed trades found)` };
      }
      brokerImport.warnings.forEach((warning) => toast.warning(`${file.name}: ${warning}`));
      return {
        transactions: brokerImport.transactions,
        brokerName: brokerImport.brokerName,
        currency: brokerImport.transactions.find((t) => t.currency)?.currency ?? null,
      };
    }

    // 2. Generic CSV/text with column mapping (covers brokers without an adapter, e.g. Vanguard).
    const { headers: parsedHeaders, rows: parsedRows } = await parseCSVOrText(content);
    if (parsedHeaders.length === 0 || parsedRows.length === 0) {
      return { skippedReason: `${file.name} (no tabular data found)` };
    }

    let detectedMapping = {} as ColumnMapping;
    let detectedSideMap: SideValueMapping = {};
    if (ai.apiKey) {
      try {
        const response = await mapColumnsWithLLM(parsedHeaders, parsedRows.slice(0, 3), {
          apiKey: ai.apiKey,
          provider: ai.provider,
          model: ai.model,
        });
        detectedMapping = response.mapping as ColumnMapping;
        detectedSideMap = response.sideValues || {};
        if (response.usage && aiContext?.recordUsage) {
          aiContext.recordUsage(ai.provider || 'google', ai.model || 'gemini-1.5-flash', {
            inputTokens: response.usage.promptTokens,
            outputTokens: response.usage.completionTokens,
            totalTokens: response.usage.totalTokens,
          });
        }
      } catch {
        detectedMapping = mapColumnsOffline(parsedHeaders);
      }
    } else {
      detectedMapping = mapColumnsOffline(parsedHeaders);
    }

    const hasRequired =
      (detectedMapping.symbol && detectedMapping.quantity && detectedMapping.price) ||
      (detectedMapping.symbol && detectedMapping.realizedPnL);
    if (!hasRequired) {
      return { skippedReason: `${file.name} (couldn't auto-map columns — import it on its own to map manually)` };
    }

    return {
      transactions: processRowsWithMapping(detectedMapping, detectedSideMap, parsedRows),
      brokerName: inferBrokerName(brokerSource) || 'Generic CSV',
      currency: detectCurrency(parsedHeaders, parsedRows) ?? null,
    };
  };

  // Merge several files (possibly from different brokers) into one preview.
  const handleFiles = (files: File[]) => {
    // Single file keeps the richer existing flow (manual mapping, image vision).
    if (files.length <= 1) {
      const file = files[0];
      if (file) handleData(file, file.type.startsWith('image/') ? 'image' : 'file');
      return;
    }

    startProcessing(async () => {
      setDetectedBrokerName(null);
      setDetectedCurrency(null);

      const config = aiContext?.config;
      const ai = {
        provider: config?.customLLM?.provider as LLMProvider | undefined,
        apiKey: config?.customLLM?.apiKey,
        model: config?.customLLM?.model,
      };

      const merged: NormalizedTransaction[] = [];
      const brokerNames = new Set<string>();
      const skipped: string[] = [];
      let currency: string | null = null;

      for (const file of files) {
        // Screenshots need the single-file vision path; can't be merged in a batch.
        if (file.type.startsWith('image/')) {
          skipped.push(`${file.name} (screenshot — import images one at a time)`);
          continue;
        }

        let content = '';
        try {
          content = await file.text();
        } catch {
          skipped.push(`${file.name} (unreadable)`);
          continue;
        }

        const result = await parseFileForMerge(file, content, ai);
        if ('skippedReason' in result) {
          skipped.push(result.skippedReason);
          continue;
        }

        merged.push(...result.transactions);
        brokerNames.add(result.brokerName);
        if (!currency && result.currency) currency = result.currency;
      }

      if (merged.length === 0) {
        throw new Error(
          skipped.length
            ? `No importable trades found. Skipped: ${skipped.join('; ')}`
            : 'No importable trades found in the dropped files.',
        );
      }

      const deduped = dedupeTransactions(merged);
      const duplicatesRemoved = merged.length - deduped.length;
      const importedFileCount = files.length - skipped.length;

      setPreviewTransactions(deduped);
      if (currency) setDetectedCurrency(currency);
      setDetectedBrokerName(
        brokerNames.size > 1
          ? `${brokerNames.size} sources (${[...brokerNames].join(', ')})`
          : [...brokerNames][0] ?? null,
      );

      // Save each source file to the library (mirrors the broker single-file path).
      files.forEach((file) => {
        if (!file.type.startsWith('image/')) importFileToLibrary(file).catch(console.error);
      });

      setStep('preview');

      toast.success(
        `Merged ${deduped.length} trades from ${importedFileCount} file${importedFileCount === 1 ? '' : 's'}.`,
        duplicatesRemoved > 0
          ? { description: `Removed ${duplicatesRemoved} duplicate row${duplicatesRemoved === 1 ? '' : 's'}.` }
          : undefined,
      );
      if (skipped.length) {
        toast.warning(`Skipped ${skipped.length} file${skipped.length === 1 ? '' : 's'}: ${skipped.join('; ')}`);
      }
    });
  };

  const handleMappingConfirm = (finalMapping: ColumnMapping, finalSideMap: SideValueMapping) => {
    try {
      const normalized = processRowsWithMapping(finalMapping, finalSideMap, rows);
      setPreviewTransactions(normalized);
      setStep('preview');
    } catch {
      setError("Failed to transform data");
    }
  };

  const handleImport = async (
    selectedTransactions: NormalizedTransaction[],
    accountData: { id?: string; name?: string; currency?: string; type?: string }
  ) => {
    startProcessing(async () => {
      const { toTransactionRecords } = await import('@/lib/import/converter');
      const { importData: dbImport } = await import('@/lib/db/trades');

      let targetAccountId = accountData.id;
      let targetAccount: AccountRecord;

      if (!targetAccountId) {
        // Create new account
        targetAccountId = `acc-${Date.now()}`;
        targetAccount = {
          accountId: targetAccountId,
          name: accountData.name || `Account ${new Date().toLocaleDateString()}`,
          currency: accountData.currency || 'USD',
          type: accountData.type || 'Custom',
          address: '',
          importedAt: Date.now(),
        };
      } else {
        // Use existing
        const existing = accounts.find(a => a.accountId === targetAccountId);
        if (!existing) throw new Error("Selected account not found");
        targetAccount = existing;
      }

      const transactions = toTransactionRecords(selectedTransactions, targetAccountId, targetAccount.currency);
      await dbImport(targetAccount, transactions, []);

      if (importFile) importFileToLibrary(importFile).catch(console.error);

      toast.success(`Successfully imported ${transactions.length} trades!`, {
        description: `Imported to account "${targetAccount.name}" (${targetAccount.currency})`,
      });

      await refreshAccounts(targetAccountId);
      clearImportState();
      router.push('/journal');
    });
  };

  // Determine active provider info for UI
  const config = aiContext?.config;
  const activeProviderId = config?.customLLM?.provider;
  const activeModelId = config?.customLLM?.model;

  const providerInfo = activeProviderId
    ? getProvider(activeProviderId as LLMProvider)
    : null;

  return (
    <section className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Import Trades</h1>
          <p className="text-muted mt-2">
            Upload CSV, TLG, or drop a screenshot of your trade history.
          </p>
        </div>

        {providerInfo && (
          <div className="bg-card-bg border border-card-border rounded-2xl px-4 py-3 flex items-center gap-3 self-start md:self-auto shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-accent-light flex items-center justify-center text-accent">
              <Cpu size={20} />
            </div>
            <div>
              <div className="text-[10px] text-muted uppercase font-bold tracking-widest leading-none mb-1">Active AI Engine</div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">{providerInfo.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-accent-light text-accent rounded-md font-medium uppercase">{activeModelId?.split('/').pop() || activeModelId}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {step === 'upload' && (
        <div className="space-y-6">
          <DropZone onData={handleData} onFiles={handleFiles} isProcessing={isProcessing} />

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-card-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-3 text-muted font-bold tracking-wider">Or</span>
            </div>
          </div>

          <div className="flex items-center gap-3 max-w-xl mx-auto w-full">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted">
                <LinkIcon size={18} />
              </div>
              <input
                type="text"
                placeholder="Paste a URL (e.g. from dropfile.dev)..."
                className="w-full bg-card-bg border border-card-border rounded-xl pl-11 pr-4 py-3 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all font-medium"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const url = e.currentTarget.value.trim();
                    if (url) handleData(url, 'text');
                  }
                }}
              />
            </div>
            <button
              className="px-6 py-3 bg-accent text-white rounded-xl text-sm font-semibold hover:bg-accent/90 transition-all shadow-sm shrink-0"
              onClick={(e) => {
                const input = e.currentTarget.previousElementSibling?.querySelector('input') as HTMLInputElement;
                const url = input?.value.trim();
                if (url) handleData(url, 'text');
              }}
            >
              Import URL
            </button>
          </div>

          {error && (
            <div className="p-4 bg-loss/10 border border-loss/20 rounded-lg text-loss text-sm text-center">
              {error}
            </div>
          )}

          {/* IBKR TradeLog Tutorial Video & Guide */}
          <IBKRExportGuide />
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
          accounts={accounts}
          suggestedCurrency={detectedCurrency || 'USD'}
          detectedBrokerName={detectedBrokerName}
          onConfirm={handleImport}
          onBack={() => setStep(headers.length > 0 ? 'mapping' : 'upload')}
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
    </section>
  );
}

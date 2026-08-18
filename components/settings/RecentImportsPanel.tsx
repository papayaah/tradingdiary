'use client';

import { useCallback, useEffect, useState } from 'react';
import { History, Undo2, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAccount } from '@/contexts/AccountContext';
import { getImportBatches, undoImportBatch } from '@/lib/db/import-batches';
import type { ImportBatchRecord } from '@/lib/db/schema';

export default function RecentImportsPanel() {
  const { accounts, selectedAccountId, refreshAccounts } = useAccount();
  const [batches, setBatches] = useState<ImportBatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const accountName = useCallback(
    (accountId: string) => accounts.find((a) => a.accountId === accountId)?.name ?? 'Unknown account',
    [accounts],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBatches(await getImportBatches());
    } catch (err) {
      console.error('Failed to load import history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUndo = async (batch: ImportBatchRecord) => {
    if (
      !window.confirm(
        `Undo this import? This removes the ${batch.importedCount} trade${batch.importedCount === 1 ? '' : 's'} it added to "${accountName(batch.accountId)}". Trades from other imports are not affected.`,
      )
    ) {
      return;
    }

    setUndoingId(batch.id);
    try {
      const { removed } = await undoImportBatch(batch.id);
      await refreshAccounts(selectedAccountId ?? undefined);
      await load();
      toast.success(`Undid import — removed ${removed} trade${removed === 1 ? '' : 's'}.`);
    } catch (err) {
      console.error('Failed to undo import:', err);
      toast.error('Failed to undo import');
    } finally {
      setUndoingId(null);
    }
  };

  const formatWhen = (ms: number) => {
    const d = new Date(ms);
    return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className="bg-muted-bg/30 border border-card-border p-5 rounded-xl space-y-4">
      <div className="flex items-center gap-2 text-foreground font-bold text-sm">
        <History size={16} className="text-accent" />
        <span>Recent Imports</span>
      </div>
      <p className="text-xs text-muted leading-relaxed">
        Each import is recorded here. Undo removes only the trades that import added — trades from
        other imports and accounts are left untouched.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted py-4">
          <Loader2 size={14} className="animate-spin" />
          Loading import history…
        </div>
      ) : batches.length === 0 ? (
        <div className="p-4 bg-card-bg rounded-xl border border-card-border text-xs text-muted text-center">
          No imports yet. Imported trade logs will appear here so you can review or undo them.
        </div>
      ) : (
        <ul className="space-y-2.5">
          {batches.map((batch) => (
            <li
              key={batch.id}
              className="p-3.5 rounded-xl border border-card-border bg-card-bg flex items-start justify-between gap-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={14} className="text-accent shrink-0" />
                  <span className="text-xs font-bold text-foreground truncate">{batch.source}</span>
                  {batch.brokerName && (
                    <span className="text-[10px] font-black uppercase text-accent bg-accent/10 px-1.5 py-0.5 rounded-full tracking-wider shrink-0">
                      {batch.brokerName}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted">
                  {accountName(batch.accountId)} · {formatWhen(batch.createdAt)}
                </div>
                <div className="text-[11px] text-muted">
                  <span className="text-profit font-semibold">+{batch.importedCount} imported</span>
                  {batch.duplicateCount > 0 && (
                    <> · {batch.duplicateCount} duplicate{batch.duplicateCount === 1 ? '' : 's'} skipped</>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleUndo(batch)}
                disabled={undoingId === batch.id}
                className="py-2 px-3 bg-card-bg border border-card-border hover:border-loss/40 hover:bg-loss/10 text-loss rounded-lg text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-1.5 shrink-0"
              >
                {undoingId === batch.id ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Undo2 size={13} />
                )}
                Undo
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

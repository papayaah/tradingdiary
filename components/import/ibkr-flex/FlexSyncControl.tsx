'use client';

// Compact IBKR sync control for the dashboard/journal headers. When a Flex
// connection exists it triggers a sync (with live progress); otherwise it points
// the user to the import page to connect a broker or upload a statement.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { RefreshCw, Upload } from 'lucide-react';
import { useJournalSync } from '@/components/journal/JournalSyncProvider';
import { fetchFlexConnection, streamFlexSync } from '@/lib/ibkr-flex/client-sync';
import type { IbkrFlexConnectionView, IbkrFlexSyncProgress } from '@/lib/ibkr-flex/types';

const SECONDARY =
  'inline-flex py-2 items-center gap-2 whitespace-nowrap rounded-xl border border-card-border bg-card-bg px-3.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted-bg hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60';

const PAPER_BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] border-2 border-line bg-paper-card font-semibold text-ink transition-colors hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-60';

function progressLabel(progress: IbkrFlexSyncProgress | null): string {
  if (!progress) return 'Syncing…';
  if (progress.done != null && progress.total != null) {
    return `Importing ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`;
  }
  return progress.message || 'Syncing…';
}

export default function FlexSyncControl({
  tone = 'default',
  compact = false,
  bare = false,
}: {
  tone?: 'default' | 'paper';
  compact?: boolean;
  // Icon-only, no border/background — for embedding inside a shared container.
  bare?: boolean;
} = {}) {
  const { syncNow: pullJournalNow } = useJournalSync();
  const [connection, setConnection] = useState<IbkrFlexConnectionView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<IbkrFlexSyncProgress | null>(null);

  const load = useCallback(async () => {
    try {
      setConnection(await fetchFlexConnection());
    } catch {
      // Non-fatal: treat as not-connected and let the user retry via the page.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Pick up a connection made (or a sync run) in another tab/page.
  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const handleSync = async () => {
    setWorking(true);
    setProgress({ stage: 'requesting', message: 'Starting sync…' });
    try {
      const { connection: next, sync } = await streamFlexSync(setProgress);
      if (next) setConnection(next);
      pullJournalNow(); // refresh the on-screen journal/dashboard from the server
      toast.success('IBKR sync complete', {
        description: sync.importedCount
          ? `Imported ${sync.importedCount} new execution${sync.importedCount === 1 ? '' : 's'}.`
          : 'No new executions were found.',
      });
    } catch (error) {
      toast.error('IBKR sync failed', {
        description: error instanceof Error ? error.message : 'Try again in a moment.',
      });
    } finally {
      setWorking(false);
      setProgress(null);
    }
  };

  // Avoid a flash of the wrong state before the connection status loads.
  if (!loaded) return null;

  const base = bare
    ? 'inline-flex items-center justify-center text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60'
    : tone === 'paper'
      ? PAPER_BASE
      : SECONDARY;
  const cls = bare ? `${base} h-9 w-9 rounded-[10px]` : `${base} ${compact ? 'h-9 w-9' : 'py-2 px-3.5 text-xs'}`;
  const iconOnly = compact || bare;
  const iconSize = iconOnly ? 16 : 14;

  // Not connected → send them to set up a broker / upload a statement.
  if (!connection?.connected) {
    return (
      <Link href="/import" className={cls} title="Connect IBKR or upload a statement" aria-label="Import trades">
        <Upload size={iconSize} />
        {!iconOnly && 'Import trades'}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handleSync()}
      disabled={working}
      className={cls}
      title="Fetch new trades from IBKR now"
      aria-label="Sync IBKR"
    >
      <RefreshCw size={iconSize} className={working ? 'animate-spin' : undefined} />
      {!iconOnly && (working ? progressLabel(progress) : 'Sync IBKR')}
    </button>
  );
}

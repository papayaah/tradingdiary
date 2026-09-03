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

function progressLabel(progress: IbkrFlexSyncProgress | null): string {
  if (!progress) return 'Syncing…';
  if (progress.done != null && progress.total != null) {
    return `Importing ${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`;
  }
  return progress.message || 'Syncing…';
}

export default function FlexSyncControl() {
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

  // Not connected → send them to set up a broker / upload a statement.
  if (!connection?.connected) {
    return (
      <Link href="/import" className={SECONDARY} title="Connect IBKR or upload a statement">
        <Upload size={14} />
        Import trades
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handleSync()}
      disabled={working}
      className={SECONDARY}
      title="Fetch new trades from IBKR now"
    >
      <RefreshCw size={14} className={working ? 'animate-spin' : undefined} />
      {working ? progressLabel(progress) : 'Sync IBKR'}
    </button>
  );
}

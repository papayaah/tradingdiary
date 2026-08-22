'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  KeyRound,
  Link2,
  Loader2,
  RefreshCw,
  Unplug,
} from 'lucide-react';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth-client';
import { useJournalSync } from '@/components/journal/JournalSyncProvider';
import type {
  IbkrFlexConnectionView,
  IbkrFlexSyncProgress,
  IbkrFlexSyncResult,
  IbkrFlexSyncStreamEvent,
} from '@/lib/ibkr-flex/types';

type ConnectionResponse = {
  connection?: IbkrFlexConnectionView;
  sync?: IbkrFlexSyncResult;
  error?: string;
};

function displayDate(value: string | null): string {
  if (!value) return 'Not yet';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusLabel(connection: IbkrFlexConnectionView): string {
  if (connection.status === 'action_required') return 'Action required';
  if (connection.status === 'syncing') return 'Syncing';
  if (connection.status === 'error') return 'Retry scheduled';
  return 'Connected';
}

function progressView(progress: IbkrFlexSyncProgress): { text: string; percent: number | null } {
  const countable = progress.stage === 'importing' || progress.stage === 'building';
  if (countable && progress.total) {
    const done = progress.done ?? 0;
    const percent = Math.min(100, Math.round((done / progress.total) * 100));
    return {
      text: `${progress.message} ${done.toLocaleString()} / ${progress.total.toLocaleString()}`,
      percent,
    };
  }
  if (progress.stage === 'waiting' && progress.attempt) {
    return { text: `${progress.message} (attempt ${progress.attempt})`, percent: null };
  }
  return { text: progress.message, percent: null };
}

export default function IBKRFlexConnectionPanel() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const { syncNow: pullJournalNow } = useJournalSync();
  const [connection, setConnection] = useState<IbkrFlexConnectionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [queryId, setQueryId] = useState('');
  const [token, setToken] = useState('');
  const [progress, setProgress] = useState<IbkrFlexSyncProgress | null>(null);

  const loadConnection = useCallback(async () => {
    if (!session?.user) {
      setConnection(null);
      setLoading(false);
      return;
    }
    try {
      const response = await fetch('/api/import/ibkr-flex', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load the IBKR connection.');
      const next = (await response.json()) as IbkrFlexConnectionView | null;
      setConnection(next);
      if (next) setQueryId(next.queryId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load the IBKR connection.');
    } finally {
      setLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    void loadConnection();
  }, [loadConnection]);

  useEffect(() => {
    const refresh = () => void loadConnection();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [loadConnection]);

  const connect = async () => {
    setWorking(true);
    try {
      const response = await fetch('/api/import/ibkr-flex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queryId, token }),
      });
      const result = (await response.json()) as ConnectionResponse;
      if (result.connection) setConnection(result.connection);
      if (!response.ok) {
        throw new Error(result.sync?.error || result.error || 'IBKR could not complete the first sync.');
      }

      setToken('');
      setEditing(false);
      pullJournalNow();
      toast.success('IBKR connected', {
        description: result.sync?.importedCount
          ? `Imported ${result.sync.importedCount} new execution${result.sync.importedCount === 1 ? '' : 's'}.`
          : 'Your report is already up to date.',
      });
    } catch (error) {
      setToken('');
      toast.error('IBKR connection needs attention', {
        description: error instanceof Error ? error.message : 'Verify the token and Query ID.',
      });
    } finally {
      setWorking(false);
    }
  };

  const syncNow = async () => {
    setWorking(true);
    setProgress({ stage: 'requesting', message: 'Starting sync…' });
    try {
      const response = await fetch('/api/import/ibkr-flex/sync', { method: 'POST' });

      // Cooldown / auth / conflict guards return a plain JSON error, not a stream.
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('ndjson') || !response.body) {
        const result = (await response.json()) as ConnectionResponse;
        throw new Error(result.error || result.sync?.error || 'The sync could not complete.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let final: Extract<IbkrFlexSyncStreamEvent, { type: 'result' }> | null = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          const event = JSON.parse(line) as IbkrFlexSyncStreamEvent;
          if (event.type === 'progress') setProgress(event.progress);
          else final = event;
        }
      }

      if (!final) throw new Error('The sync ended before it finished.');
      if ('error' in final) throw new Error(final.error);
      if (final.connection) setConnection(final.connection);
      if (final.sync.status !== 'success') {
        throw new Error(final.sync.error || 'The sync could not complete.');
      }

      pullJournalNow();
      toast.success('IBKR sync complete', {
        description: final.sync.importedCount
          ? `Imported ${final.sync.importedCount} new execution${final.sync.importedCount === 1 ? '' : 's'}.`
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

  const disconnect = async () => {
    setWorking(true);
    try {
      const response = await fetch('/api/import/ibkr-flex', { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not disconnect IBKR.');
      setConnection(null);
      setQueryId('');
      setToken('');
      setEditing(false);
      setConfirmDisconnect(false);
      toast.success('IBKR disconnected', { description: 'Previously imported trades were kept.' });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not disconnect IBKR.');
    } finally {
      setWorking(false);
    }
  };

  if (sessionPending || loading) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-2xl border border-card-border bg-card-bg">
        <Loader2 className="animate-spin text-accent" size={22} />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <section className="rounded-2xl border border-card-border bg-card-bg p-5 sm:p-6">
        <div className="flex gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-light text-accent">
            <Link2 size={20} />
          </div>
          <div>
            <h2 className="font-bold text-foreground">Automatic IBKR Flex sync</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Sign in to connect IBKR. Signed-in accounts sync daily even when this browser is closed.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const showForm = !connection || editing;
  const needsAttention = connection?.status === 'action_required';

  return (
    <section className="rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-light text-accent">
            <RefreshCw size={20} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold text-foreground">Automatic IBKR Flex sync</h2>
              {connection && (
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
                  needsAttention
                    ? 'bg-loss/10 text-loss'
                    : connection.status === 'error'
                      ? 'bg-loss/10 text-loss'
                      : 'bg-profit/10 text-profit'
                }`}>
                  {statusLabel(connection)}
                </span>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
              Connect once to import your 365-day report now, then sync it every morning on the server.
              Repeated reports are deduplicated automatically.
            </p>
          </div>
        </div>
        {connection && !showForm && (
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={working || connection.status === 'syncing'}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {working || connection.status === 'syncing' ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            Sync now
          </button>
        )}
      </div>

      {working && progress && (() => {
        const { text, percent } = progressView(progress);
        return (
          <div className="mt-5 rounded-xl border border-accent/30 bg-accent-light/50 p-4">
            <div className="flex items-center gap-3">
              <Loader2 className="shrink-0 animate-spin text-accent" size={18} />
              <p className="text-sm font-semibold text-foreground">{text}</p>
              {percent != null && <span className="ml-auto text-sm font-semibold text-accent">{percent}%</span>}
            </div>
            {percent != null && (
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-card-border">
                <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${percent}%` }} />
              </div>
            )}
            <p className="mt-2 text-xs text-muted">
              A full 365-day import can take a minute or two. You can keep this page open.
            </p>
          </div>
        );
      })()}

      {connection && !showForm && (
        <>
          {connection.lastError && (
            <div className="mt-5 flex gap-3 rounded-xl border border-loss/30 bg-loss/10 p-4 text-sm text-loss">
              <AlertCircle className="mt-0.5 shrink-0" size={18} />
              <div>
                <p className="font-semibold">{needsAttention ? 'Reconnect IBKR to resume automatic sync.' : 'The last sync did not complete.'}</p>
                <p className="mt-1 opacity-90">{connection.lastError}</p>
              </div>
            </div>
          )}

          <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-card-border bg-background p-4">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><Clock3 size={14} /> Last sync</dt>
              <dd className="mt-2 text-sm font-semibold text-foreground">{displayDate(connection.lastSyncedAt)}</dd>
            </div>
            <div className="rounded-xl border border-card-border bg-background p-4">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><Clock3 size={14} /> Next sync</dt>
              <dd className="mt-2 text-sm font-semibold text-foreground">{needsAttention ? 'Paused until reconnected' : displayDate(connection.nextSyncAt)}</dd>
            </div>
            <div className="rounded-xl border border-card-border bg-background p-4">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><CheckCircle2 size={14} /> Last import</dt>
              <dd className="mt-2 text-sm font-semibold text-foreground">{connection.lastImportedCount} new / {connection.lastReportCount} reported</dd>
            </div>
            <div className="rounded-xl border border-card-border bg-background p-4">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><KeyRound size={14} /> Connection</dt>
              <dd className="mt-2 text-sm font-semibold text-foreground">Query {connection.queryId} · Token ••••{connection.tokenLastFour}</dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted">{connection.totalImportedCount} executions imported by this connection</span>
            <button type="button" onClick={() => { setEditing(true); setConfirmDisconnect(false); }} className="font-semibold text-accent hover:underline">
              Update connection
            </button>
            <button type="button" onClick={() => setConfirmDisconnect(true)} className="font-semibold text-loss hover:underline">
              Disconnect
            </button>
          </div>

          {confirmDisconnect && (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-card-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-foreground">Stop future IBKR syncs? Your imported trades will remain.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmDisconnect(false)} className="rounded-lg border border-card-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted-bg">Keep connected</button>
                <button type="button" onClick={() => void disconnect()} disabled={working} className="inline-flex items-center gap-2 rounded-lg bg-loss px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"><Unplug size={15} /> Disconnect</button>
              </div>
            </div>
          )}
        </>
      )}

      {showForm && (
        <div className="mt-5 rounded-xl border border-card-border bg-background p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-foreground">
              Flex Query ID
              <input
                inputMode="numeric"
                autoComplete="off"
                value={queryId}
                onChange={(event) => setQueryId(event.target.value)}
                placeholder="Example: 1234567"
                className="mt-2 w-full rounded-xl border border-card-border bg-card-bg px-3.5 py-3 font-mono text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </label>
            <label className="text-sm font-semibold text-foreground">
              Flex Web Service token
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder={connection ? 'Enter the replacement token' : 'Paste your token'}
                className="mt-2 w-full rounded-xl border border-card-border bg-card-bg px-3.5 py-3 font-mono text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </label>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">
            The token is encrypted before it is stored and is never shown again. The connector requests up to 365 days from your Activity report on each sync.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void connect()}
              disabled={working || !queryId.trim() || !token.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {working ? <Loader2 className="animate-spin" size={16} /> : <Link2 size={16} />}
              {connection ? 'Save and test' : 'Connect and import'}
            </button>
            {connection && (
              <button type="button" onClick={() => { setEditing(false); setToken(''); }} disabled={working} className="rounded-xl border border-card-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted-bg">
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

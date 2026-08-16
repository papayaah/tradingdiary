'use client';

import { Cloud, CloudOff, RefreshCw, AlertCircle } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { useJournalSync } from './JournalSyncProvider';

/**
 * Compact journal sync state: local / syncing / synced / error. Hidden for
 * guests (nothing to sync). See docs/specs/journal-persistence-and-sync.md.
 */
export default function SyncStatusIndicator() {
  const { data: session } = authClient.useSession();
  const { status } = useJournalSync();

  // Guests keep everything local — no indicator.
  if (!session?.user) return null;

  const config = {
    local: { icon: CloudOff, label: 'Local only', className: 'text-muted' },
    syncing: { icon: RefreshCw, label: 'Syncing…', className: 'text-muted' },
    synced: { icon: Cloud, label: 'Synced', className: 'text-profit' },
    error: { icon: AlertCircle, label: 'Sync failed', className: 'text-loss' },
  }[status];

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${config.className}`}
      title={`Journal ${config.label.toLowerCase()}`}
      aria-live="polite"
    >
      <Icon size={14} className={status === 'syncing' ? 'animate-spin' : ''} />
      <span className="hidden sm:inline">{config.label}</span>
    </span>
  );
}

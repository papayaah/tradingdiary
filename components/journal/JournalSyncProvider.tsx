'use client';

import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { useAccount } from '@/contexts/AccountContext';
import {
  getCursor,
  setCursor,
  pullAndMerge,
  pushJournalSnapshot,
} from '@/lib/journal/client-sync';
import { onJournalChanged, notifyJournalSynced } from '@/lib/journal/sync-bus';

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error';

interface JournalSyncContextValue {
  status: SyncStatus;
  lastSyncedAt: number | null;
  syncNow: () => void;
}

const JournalSyncContext = createContext<JournalSyncContextValue>({
  status: 'local',
  lastSyncedAt: null,
  syncNow: () => {},
});

const PUSH_DEBOUNCE_MS = 1500;

export function JournalSyncProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;
  const { refreshAccounts } = useAccount();

  const [status, setStatus] = useState<SyncStatus>('local');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  // Refs guard against overlapping runs and stale closures.
  const running = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = userId;

  /** Pull remote changes, merge, then push the (now-merged) local snapshot. */
  const fullSync = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid || running.current) return;
    running.current = true;
    setStatus('syncing');
    try {
      const pull = await pullAndMerge(getCursor(uid));
      if (!pull.authenticated) {
        setStatus('local');
        return;
      }
      setCursor(uid, pull.seq);
      if (pull.changed) {
        await refreshAccounts();
        notifyJournalSynced();
      }

      const push = await pushJournalSnapshot();
      if (push.authenticated) setCursor(uid, push.seq);

      setStatus('synced');
      setLastSyncedAt(Date.now());
    } catch (error) {
      console.error('Journal sync failed:', error);
      setStatus('error');
    } finally {
      running.current = false;
    }
  }, [refreshAccounts]);

  /** Pull only — used on window focus to pick up other devices' changes. */
  const pullOnly = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid || running.current) return;
    running.current = true;
    try {
      const pull = await pullAndMerge(getCursor(uid));
      if (!pull.authenticated) return;
      setCursor(uid, pull.seq);
      if (pull.changed) {
        await refreshAccounts();
        notifyJournalSynced();
        setLastSyncedAt(Date.now());
      }
    } catch (error) {
      console.error('Journal pull failed:', error);
    } finally {
      running.current = false;
    }
  }, [refreshAccounts]);

  const schedulePush = useCallback(() => {
    if (!userIdRef.current) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      void (async () => {
        const uid = userIdRef.current;
        if (!uid || running.current) return;
        running.current = true;
        setStatus('syncing');
        try {
          const push = await pushJournalSnapshot();
          if (push.authenticated) {
            setCursor(uid, push.seq);
            setStatus('synced');
            setLastSyncedAt(Date.now());
          } else {
            setStatus('local');
          }
        } catch (error) {
          console.error('Journal push failed:', error);
          setStatus('error');
        } finally {
          running.current = false;
        }
      })();
    }, PUSH_DEBOUNCE_MS);
  }, []);

  // Initial sync when a user becomes signed in.
  useEffect(() => {
    if (!userId) {
      setStatus('local');
      return;
    }
    void fullSync();
  }, [userId, fullSync]);

  // Push after local mutations (debounced).
  useEffect(() => {
    if (!userId) return;
    return onJournalChanged(schedulePush);
  }, [userId, schedulePush]);

  // Pull when the tab regains focus.
  useEffect(() => {
    if (!userId) return;
    const onFocus = () => void pullOnly();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [userId, pullOnly]);

  const value: JournalSyncContextValue = {
    status,
    lastSyncedAt,
    syncNow: () => void fullSync(),
  };

  return <JournalSyncContext.Provider value={value}>{children}</JournalSyncContext.Provider>;
}

export function useJournalSync() {
  return useContext(JournalSyncContext);
}

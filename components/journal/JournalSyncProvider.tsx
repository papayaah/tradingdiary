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
const DIRTY_PREFIX = 'journal-sync-dirty:';

function isJournalDirty(userId: string): boolean {
  return localStorage.getItem(DIRTY_PREFIX + userId) === '1';
}

function markJournalDirty(userId: string): void {
  localStorage.setItem(DIRTY_PREFIX + userId, '1');
}

function clearJournalDirty(userId: string): void {
  localStorage.removeItem(DIRTY_PREFIX + userId);
}

export function JournalSyncProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;
  const { refreshAccounts } = useAccount();

  const [status, setStatus] = useState<SyncStatus>('local');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  // Refs guard against overlapping runs and stale closures.
  const running = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirtyGeneration = useRef(0);
  const initialSyncUser = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = userId;
  // Only reconcile (propagate deletes) once this session has pulled at least
  // once, so a fresh device can't tombstone the server before merging.
  const hasPulled = useRef(false);

  /** Pull remote changes. Only upload when a local mutation is pending. */
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
      hasPulled.current = true;
      setCursor(uid, pull.seq);
      if (pull.changed) {
        await refreshAccounts();
        notifyJournalSynced();
      }

      // A page load used to upload the complete local journal every time. That
      // made merely opening the dashboard scale with lifetime execution count.
      // Persist a dirty bit instead, so full uploads happen only after an actual
      // local edit (including one left pending by a previous browser session).
      if (isJournalDirty(uid)) {
        const generation = dirtyGeneration.current;
        const push = await pushJournalSnapshot(hasPulled.current);
        if (push.authenticated) {
          setCursor(uid, push.seq);
          if (dirtyGeneration.current === generation) clearJournalDirty(uid);
        }
      }

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
      hasPulled.current = true;
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
    const scheduledUserId = userIdRef.current;
    if (!scheduledUserId) return;
    dirtyGeneration.current += 1;
    markJournalDirty(scheduledUserId);
    if (pushTimer.current) clearTimeout(pushTimer.current);
    const run = () => {
      void (async () => {
        const uid = userIdRef.current;
        if (!uid || uid !== scheduledUserId) return;
        if (running.current) {
          pushTimer.current = setTimeout(run, PUSH_DEBOUNCE_MS);
          return;
        }
        const generation = dirtyGeneration.current;
        running.current = true;
        setStatus('syncing');
        try {
          const push = await pushJournalSnapshot(hasPulled.current);
          if (push.authenticated) {
            setCursor(uid, push.seq);
            setStatus('synced');
            setLastSyncedAt(Date.now());
            if (dirtyGeneration.current === generation) clearJournalDirty(uid);
          } else {
            setStatus('local');
          }
        } catch (error) {
          console.error('Journal push failed:', error);
          setStatus('error');
        } finally {
          running.current = false;
          if (dirtyGeneration.current !== generation && isJournalDirty(uid)) {
            pushTimer.current = setTimeout(run, PUSH_DEBOUNCE_MS);
          }
        }
      })();
    };
    pushTimer.current = setTimeout(run, PUSH_DEBOUNCE_MS);
  }, []);

  // Initial sync when a user becomes signed in.
  useEffect(() => {
    if (!userId) {
      initialSyncUser.current = null;
      hasPulled.current = false;
      setStatus('local');
      return;
    }
    if (initialSyncUser.current === userId) return;
    initialSyncUser.current = userId;
    hasPulled.current = false;
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

/**
 * Tiny window-event bus connecting local journal mutations to the sync engine
 * and back. Keeps the IndexedDB data layer decoupled from React: data-access
 * functions call notifyJournalChanged() after a write; the sync provider
 * subscribes and pushes. After a pull merges remote data, the provider calls
 * notifyJournalSynced() so open pages reload from IndexedDB.
 */

const CHANGED = 'journal:changed';
const SYNCED = 'journal:synced';

export interface JournalChangeDetail {
  /** Accounts whose execution/account source data changed. Omit for notes,
   * tags, cash flows, and other writes that cannot affect day summaries. */
  summaryAccountIds?: string[];
  /** Used by destructive all-data operations. */
  allSummaries?: boolean;
}

/** Fire after a local write to IndexedDB (import, manual entry, note edit, …). */
export function notifyJournalChanged(detail: JournalChangeDetail = {}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<JournalChangeDetail>(CHANGED, { detail }));
}

export function onJournalChanged(cb: (detail: JournalChangeDetail) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    cb((event as CustomEvent<JournalChangeDetail>).detail ?? {});
  };
  window.addEventListener(CHANGED, listener);
  return () => window.removeEventListener(CHANGED, listener);
}

/** Fire after a pull merged remote changes into IndexedDB. */
export function notifyJournalSynced(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SYNCED));
}

export function onJournalSynced(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(SYNCED, cb);
  return () => window.removeEventListener(SYNCED, cb);
}

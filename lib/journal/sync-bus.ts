/**
 * Tiny window-event bus connecting local journal mutations to the sync engine
 * and back. Keeps the IndexedDB data layer decoupled from React: data-access
 * functions call notifyJournalChanged() after a write; the sync provider
 * subscribes and pushes. After a pull merges remote data, the provider calls
 * notifyJournalSynced() so open pages reload from IndexedDB.
 */

const CHANGED = 'journal:changed';
const SYNCED = 'journal:synced';

/** Fire after a local write to IndexedDB (import, manual entry, note edit, …). */
export function notifyJournalChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHANGED));
}

export function onJournalChanged(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
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

// Client-side helpers for the IBKR Flex connection: load status and run the
// streaming sync. Shared by the full connection panel and the compact sync
// control on the dashboard/journal so the NDJSON parsing lives in one place.

import type {
  IbkrFlexConnectionView,
  IbkrFlexSyncProgress,
  IbkrFlexSyncResult,
  IbkrFlexSyncStreamEvent,
} from './types';

/** Current connection, or null when the user hasn't connected IBKR Flex. */
export async function fetchFlexConnection(): Promise<IbkrFlexConnectionView | null> {
  const res = await fetch('/api/import/ibkr-flex', { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load the IBKR connection.');
  return (await res.json()) as IbkrFlexConnectionView | null;
}

export interface FlexSyncOutcome {
  connection: IbkrFlexConnectionView | null;
  sync: IbkrFlexSyncResult;
}

/**
 * Trigger a Flex sync and stream its progress. Resolves with the final result
 * on success; throws with a human-readable message otherwise (cooldown, auth,
 * or a failed sync). `onProgress` receives each progress event as it arrives.
 */
export async function streamFlexSync(
  onProgress?: (progress: IbkrFlexSyncProgress) => void,
): Promise<FlexSyncOutcome> {
  const response = await fetch('/api/import/ibkr-flex/sync', { method: 'POST' });

  // Cooldown / auth / conflict guards return a plain JSON error, not a stream.
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('ndjson') || !response.body) {
    const result = await response.json().catch(() => ({}));
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
      if (event.type === 'progress') onProgress?.(event.progress);
      else final = event;
    }
  }

  if (!final) throw new Error('The sync ended before it finished.');
  if ('error' in final) throw new Error((final as { error: string }).error);
  if (final.sync.status !== 'success') {
    throw new Error(final.sync.error || 'The sync could not complete.');
  }
  return { connection: final.connection, sync: final.sync };
}

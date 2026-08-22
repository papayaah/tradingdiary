export type IbkrFlexConnectionStatus = 'active' | 'syncing' | 'error' | 'action_required';

export interface IbkrFlexConnectionView {
  connected: true;
  queryId: string;
  tokenLastFour: string;
  status: IbkrFlexConnectionStatus;
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
  lastAttemptAt: string | null;
  lastImportedCount: number;
  totalImportedCount: number;
  lastReportCount: number;
  lastErrorCode: string | null;
  lastError: string | null;
}

export interface IbkrFlexSyncResult {
  status: 'success' | 'busy' | 'error' | 'action_required';
  importedCount: number;
  reportCount: number;
  nextSyncAt: string | null;
  errorCode?: string;
  error?: string;
}

/** Coarse stage of a running sync, surfaced to the client for live progress. */
export type IbkrFlexSyncStage =
  | 'requesting'
  | 'waiting'
  | 'parsing'
  | 'importing'
  | 'building'
  | 'done';

export interface IbkrFlexSyncProgress {
  stage: IbkrFlexSyncStage;
  message: string;
  /** Completed units for a countable stage (importing/building). */
  done?: number;
  /** Total units for a countable stage. */
  total?: number;
  /** Poll attempt while waiting for IBKR to build the report. */
  attempt?: number;
}

/** Newline-delimited events streamed by POST /api/import/ibkr-flex/sync. */
export type IbkrFlexSyncStreamEvent =
  | { type: 'progress'; progress: IbkrFlexSyncProgress }
  | { type: 'result'; connection: IbkrFlexConnectionView | null; sync: IbkrFlexSyncResult }
  | { type: 'result'; error: string };

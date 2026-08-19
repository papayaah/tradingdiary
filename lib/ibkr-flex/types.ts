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

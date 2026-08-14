import { getSharedCacheStore } from '@/lib/scanner/shared/cache-store';

export const SCANNER_CONTROL_KEY = 'scanner:control:global';
const CONTROL_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000;

export interface ScannerControlState {
  paused: boolean;
  changedAt: string | null;
  changedBy: string | null;
}

export function parseScannerControl(raw: string | null): ScannerControlState {
  if (!raw) return { paused: false, changedAt: null, changedBy: null };
  try {
    const value = JSON.parse(raw) as Partial<ScannerControlState>;
    return {
      paused: value.paused === true,
      changedAt: typeof value.changedAt === 'string' ? value.changedAt : null,
      changedBy: typeof value.changedBy === 'string' ? value.changedBy : null,
    };
  } catch {
    return { paused: raw === 'paused', changedAt: null, changedBy: null };
  }
}

export async function readScannerControl(): Promise<ScannerControlState> {
  return parseScannerControl(await getSharedCacheStore().get(SCANNER_CONTROL_KEY));
}

export async function writeScannerControl(paused: boolean, changedBy: string): Promise<ScannerControlState> {
  const state: ScannerControlState = {
    paused,
    changedAt: new Date().toISOString(),
    changedBy,
  };
  await getSharedCacheStore().set(SCANNER_CONTROL_KEY, JSON.stringify(state), CONTROL_TTL_MS);
  return state;
}

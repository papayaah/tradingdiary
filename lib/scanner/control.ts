import { getSharedCacheStore } from '@/lib/scanner/shared/cache-store';

export const SCANNER_CONTROL_KEY = 'scanner:control:global';
const CONTROL_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000;

export const EQUITIES_PROVIDERS = ['auto', 'ibkr', 'tiingo', 'polygon', 'twelve', 'alpaca', 'yahoo'] as const;
export type EquitiesProvider = (typeof EQUITIES_PROVIDERS)[number];

export function isEquitiesProvider(value: unknown): value is EquitiesProvider {
  return typeof value === 'string' && EQUITIES_PROVIDERS.includes(value as EquitiesProvider);
}

function defaultEquitiesProvider(): EquitiesProvider {
  return isEquitiesProvider(process.env.EQUITIES_PROVIDER) ? process.env.EQUITIES_PROVIDER : 'auto';
}

export interface ScannerControlState {
  paused: boolean;
  equitiesProvider: EquitiesProvider;
  changedAt: string | null;
  changedBy: string | null;
}

export function parseScannerControl(raw: string | null): ScannerControlState {
  if (!raw) return { paused: false, equitiesProvider: defaultEquitiesProvider(), changedAt: null, changedBy: null };
  try {
    const value = JSON.parse(raw) as Partial<ScannerControlState>;
    return {
      paused: value.paused === true,
      equitiesProvider: isEquitiesProvider(value.equitiesProvider)
        ? value.equitiesProvider
        : defaultEquitiesProvider(),
      changedAt: typeof value.changedAt === 'string' ? value.changedAt : null,
      changedBy: typeof value.changedBy === 'string' ? value.changedBy : null,
    };
  } catch {
    return {
      paused: raw === 'paused',
      equitiesProvider: defaultEquitiesProvider(),
      changedAt: null,
      changedBy: null,
    };
  }
}

export async function readScannerControl(): Promise<ScannerControlState> {
  return parseScannerControl(await getSharedCacheStore().get(SCANNER_CONTROL_KEY));
}

export async function writeScannerControl(paused: boolean, changedBy: string): Promise<ScannerControlState> {
  const current = await readScannerControl();
  const state: ScannerControlState = {
    paused,
    equitiesProvider: current.equitiesProvider,
    changedAt: new Date().toISOString(),
    changedBy,
  };
  await getSharedCacheStore().set(SCANNER_CONTROL_KEY, JSON.stringify(state), CONTROL_TTL_MS);
  return state;
}

export async function writeEquitiesProvider(
  equitiesProvider: EquitiesProvider,
  changedBy: string,
): Promise<ScannerControlState> {
  const current = await readScannerControl();
  const state: ScannerControlState = {
    paused: current.paused,
    equitiesProvider,
    changedAt: new Date().toISOString(),
    changedBy,
  };
  await getSharedCacheStore().set(SCANNER_CONTROL_KEY, JSON.stringify(state), CONTROL_TTL_MS);
  return state;
}

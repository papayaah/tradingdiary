import { getSharedCacheStore } from '@/lib/scanner/shared/cache-store';

export const SCANNER_CONTROL_KEY = 'scanner:control:global';
const CONTROL_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000;

export const EQUITIES_PROVIDERS = ['auto', 'ibkr', 'tiingo', 'polygon', 'twelve', 'alpaca', 'yahoo'] as const;
export type EquitiesProvider = (typeof EQUITIES_PROVIDERS)[number];

// Provider scopes the admin can tune a manual cadence override for. Kept in sync
// with the scopes the governor recompute and admin governor view report on.
export const GOVERNOR_SCOPES = [
  'tiingo:server',
  'polygon-io:server',
  'ibkr-cme:server',
  'yahoo-finance:server',
] as const;
export type GovernorScope = (typeof GOVERNOR_SCOPES)[number];

export function isGovernorScope(value: unknown): value is GovernorScope {
  return typeof value === 'string' && GOVERNOR_SCOPES.includes(value as GovernorScope);
}

export function isEquitiesProvider(value: unknown): value is EquitiesProvider {
  return typeof value === 'string' && EQUITIES_PROVIDERS.includes(value as EquitiesProvider);
}

/** Parse a per-scope cadence override map, dropping non-positive / malformed entries. */
function parseCadenceOverrides(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [scope, raw] of Object.entries(value as Record<string, unknown>)) {
    const seconds = Number(raw);
    if (isGovernorScope(scope) && Number.isFinite(seconds) && seconds > 0) {
      out[scope] = Math.round(seconds);
    }
  }
  return out;
}

function defaultEquitiesProvider(): EquitiesProvider {
  return isEquitiesProvider(process.env.EQUITIES_PROVIDER) ? process.env.EQUITIES_PROVIDER : 'auto';
}

export interface ScannerControlState {
  paused: boolean;
  equitiesProvider: EquitiesProvider;
  // Manual per-provider-scope cadence overrides in seconds. When a scope is
  // present, the governor uses it (clamped to the scope's floor) instead of its
  // computed cadence. Absent scopes stay fully governor-driven.
  cadenceOverrides: Record<string, number>;
  changedAt: string | null;
  changedBy: string | null;
}

export function parseScannerControl(raw: string | null): ScannerControlState {
  if (!raw) {
    return {
      paused: false,
      equitiesProvider: defaultEquitiesProvider(),
      cadenceOverrides: {},
      changedAt: null,
      changedBy: null,
    };
  }
  try {
    const value = JSON.parse(raw) as Partial<ScannerControlState>;
    return {
      paused: value.paused === true,
      equitiesProvider: isEquitiesProvider(value.equitiesProvider)
        ? value.equitiesProvider
        : defaultEquitiesProvider(),
      cadenceOverrides: parseCadenceOverrides(value.cadenceOverrides),
      changedAt: typeof value.changedAt === 'string' ? value.changedAt : null,
      changedBy: typeof value.changedBy === 'string' ? value.changedBy : null,
    };
  } catch {
    return {
      paused: raw === 'paused',
      equitiesProvider: defaultEquitiesProvider(),
      cadenceOverrides: {},
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
    ...current,
    paused,
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
    ...current,
    equitiesProvider,
    changedAt: new Date().toISOString(),
    changedBy,
  };
  await getSharedCacheStore().set(SCANNER_CONTROL_KEY, JSON.stringify(state), CONTROL_TTL_MS);
  return state;
}

/**
 * Set (seconds > 0) or clear (null) the manual cadence override for one provider
 * scope. The scanner's governor recompute applies it on its next pass, clamped to
 * the scope's floor so a manual value can never breach a provider's hard pacing.
 */
export async function writeCadenceOverride(
  scope: GovernorScope,
  seconds: number | null,
  changedBy: string,
): Promise<ScannerControlState> {
  const current = await readScannerControl();
  const cadenceOverrides = { ...current.cadenceOverrides };
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    delete cadenceOverrides[scope];
  } else {
    cadenceOverrides[scope] = Math.round(seconds);
  }
  const state: ScannerControlState = {
    ...current,
    cadenceOverrides,
    changedAt: new Date().toISOString(),
    changedBy,
  };
  await getSharedCacheStore().set(SCANNER_CONTROL_KEY, JSON.stringify(state), CONTROL_TTL_MS);
  return state;
}

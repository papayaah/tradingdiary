import { getSharedCacheStore } from '@/lib/scanner/shared/cache-store';

export const SCANNER_CONTROL_KEY = 'scanner:control:global';
const CONTROL_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000;

// Per-asset-class provider option lists. Only providers actually wired for a
// class are selectable; the admin UI mirrors these and the API validates
// against them. Tiingo has no futures feed, so it is absent there.
export const EQUITIES_PROVIDERS = ['auto', 'ibkr', 'tiingo', 'polygon', 'yahoo'] as const;
export type EquitiesProvider = (typeof EQUITIES_PROVIDERS)[number];

export const CRYPTO_PROVIDERS = ['auto', 'tiingo', 'yahoo'] as const;
export type CryptoProvider = (typeof CRYPTO_PROVIDERS)[number];

export const FUTURES_PROVIDERS = ['auto', 'ibkr', 'yahoo'] as const;
export type FuturesProvider = (typeof FUTURES_PROVIDERS)[number];

export const MARKET_ASSET_CLASSES = ['equity', 'crypto', 'futures'] as const;
export type MarketAssetClass = (typeof MARKET_ASSET_CLASSES)[number];

export function isMarketAssetClass(value: unknown): value is MarketAssetClass {
  return typeof value === 'string' && MARKET_ASSET_CLASSES.includes(value as MarketAssetClass);
}

/** Valid provider ids for one asset class, in display order. */
export function providerOptionsForClass(assetClass: MarketAssetClass): readonly string[] {
  if (assetClass === 'crypto') return CRYPTO_PROVIDERS;
  if (assetClass === 'futures') return FUTURES_PROVIDERS;
  return EQUITIES_PROVIDERS;
}

/** Whether `value` is a provider selectable for the given asset class. */
export function isProviderForClass(assetClass: MarketAssetClass, value: unknown): boolean {
  return typeof value === 'string' && providerOptionsForClass(assetClass).includes(value);
}

// Governor cadence scopes are per provider×asset-class, e.g. "tiingo:crypto:server"
// or "ibkr-cme:futures:server". They are derived at runtime from the active
// providers, so the admin can tune a manual cadence override for any of them.
export type GovernorScope = string;

const GOVERNOR_SCOPE_RE = /^[a-z0-9-]+:(equity|crypto|futures):server$/;

export function isGovernorScope(value: unknown): value is GovernorScope {
  return typeof value === 'string' && GOVERNOR_SCOPE_RE.test(value);
}

export function isEquitiesProvider(value: unknown): value is EquitiesProvider {
  return typeof value === 'string' && EQUITIES_PROVIDERS.includes(value as EquitiesProvider);
}

export function isCryptoProvider(value: unknown): value is CryptoProvider {
  return typeof value === 'string' && CRYPTO_PROVIDERS.includes(value as CryptoProvider);
}

export function isFuturesProvider(value: unknown): value is FuturesProvider {
  return typeof value === 'string' && FUTURES_PROVIDERS.includes(value as FuturesProvider);
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

export interface ProviderSelection {
  equity: EquitiesProvider;
  crypto: CryptoProvider;
  futures: FuturesProvider;
}

export interface ClassPauseState {
  equity: boolean;
  crypto: boolean;
  futures: boolean;
}

export interface ScannerControlState {
  // Global hard pause. Overrides everything: when true, no class-level provider
  // or pause setting matters — the whole scanner is stopped.
  paused: boolean;
  // Centralized provider per asset class, applied to both the shared acquisition
  // scanner and every user's chart/watch requests.
  providers: ProviderSelection;
  // Per-asset-class pause. Independent of the global pause; halts both shared
  // acquisition and alert evaluation for that class only.
  pausedClasses: ClassPauseState;
  // Manual per-provider-scope cadence overrides in seconds. When a scope is
  // present, the governor uses it (clamped to the scope's floor) instead of its
  // computed cadence. Absent scopes stay fully governor-driven.
  cadenceOverrides: Record<string, number>;
  changedAt: string | null;
  changedBy: string | null;
}

function defaultProviders(): ProviderSelection {
  return { equity: defaultEquitiesProvider(), crypto: 'auto', futures: 'auto' };
}

function defaultPausedClasses(): ClassPauseState {
  return { equity: false, crypto: false, futures: false };
}

function parseProviders(value: unknown, legacyEquities: unknown): ProviderSelection {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<ProviderSelection>;
  return {
    // Seed equity from the legacy top-level `equitiesProvider` field when the new
    // shape is absent, so a persisted selection (e.g. prod's ibkr) survives the
    // rollout instead of silently reverting to the env default.
    equity: isEquitiesProvider(raw.equity)
      ? raw.equity
      : isEquitiesProvider(legacyEquities)
        ? legacyEquities
        : defaultEquitiesProvider(),
    crypto: isCryptoProvider(raw.crypto) ? raw.crypto : 'auto',
    futures: isFuturesProvider(raw.futures) ? raw.futures : 'auto',
  };
}

function parsePausedClasses(value: unknown): ClassPauseState {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<ClassPauseState>;
  return {
    equity: raw.equity === true,
    crypto: raw.crypto === true,
    futures: raw.futures === true,
  };
}

export function parseScannerControl(raw: string | null): ScannerControlState {
  if (!raw) {
    return {
      paused: false,
      providers: defaultProviders(),
      pausedClasses: defaultPausedClasses(),
      cadenceOverrides: {},
      changedAt: null,
      changedBy: null,
    };
  }
  try {
    const value = JSON.parse(raw) as Partial<ScannerControlState> & { equitiesProvider?: unknown };
    return {
      paused: value.paused === true,
      providers: parseProviders(value.providers, value.equitiesProvider),
      pausedClasses: parsePausedClasses(value.pausedClasses),
      cadenceOverrides: parseCadenceOverrides(value.cadenceOverrides),
      changedAt: typeof value.changedAt === 'string' ? value.changedAt : null,
      changedBy: typeof value.changedBy === 'string' ? value.changedBy : null,
    };
  } catch {
    return {
      paused: raw === 'paused',
      providers: defaultProviders(),
      pausedClasses: defaultPausedClasses(),
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

/**
 * Set the centralized provider for one asset class. The caller must have already
 * validated `provider` against `providerOptionsForClass(assetClass)`.
 */
export async function writeClassProvider(
  assetClass: MarketAssetClass,
  provider: string,
  changedBy: string,
): Promise<ScannerControlState> {
  const current = await readScannerControl();
  const state: ScannerControlState = {
    ...current,
    providers: { ...current.providers, [assetClass]: provider },
    changedAt: new Date().toISOString(),
    changedBy,
  };
  await getSharedCacheStore().set(SCANNER_CONTROL_KEY, JSON.stringify(state), CONTROL_TTL_MS);
  return state;
}

/** Pause or resume acquisition + evaluation for a single asset class. */
export async function writeClassPause(
  assetClass: MarketAssetClass,
  paused: boolean,
  changedBy: string,
): Promise<ScannerControlState> {
  const current = await readScannerControl();
  const state: ScannerControlState = {
    ...current,
    pausedClasses: { ...current.pausedClasses, [assetClass]: paused },
    changedAt: new Date().toISOString(),
    changedBy,
  };
  await getSharedCacheStore().set(SCANNER_CONTROL_KEY, JSON.stringify(state), CONTROL_TTL_MS);
  return state;
}

/** Asset classes currently paused (excludes the global pause, which is separate). */
export function pausedClassSet(state: ScannerControlState): Set<MarketAssetClass> {
  const set = new Set<MarketAssetClass>();
  for (const cls of MARKET_ASSET_CLASSES) {
    if (state.pausedClasses[cls]) set.add(cls);
  }
  return set;
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

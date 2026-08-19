import { scannerConfig } from '@/lib/scanner/env';
import { getSharedCacheStore } from '@/lib/scanner/shared/cache-store';
import { getProviderBudget } from '@/lib/scanner/shared/provider-budget';
import { recordRequest, reserveRequest } from '@/lib/scanner/shared/request-quota';
import { recordProviderRequest, type KeyOwner } from '@/lib/metrics/provider-usage';
import { createHash } from 'node:crypto';

export class ProviderQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderQuotaError';
  }
}

export function providerScopeForName(providerName: string): string {
  const quotaOwner = providerName === 'Tiingo Crypto'
    ? 'Tiingo'
    : providerName === 'IBKR (Stocks)'
      ? 'IBKR (CME)'
      : providerName;
  const slug = quotaOwner
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug}:server`;
}

export function providerCredentialScope(
  providerName: string,
  credential: string | undefined,
  keyOwner: KeyOwner,
): string {
  const base = providerScopeForName(providerName).replace(/:server$/, '');
  if (keyOwner !== 'user' || !credential) return `${base}:server`;
  const fingerprint = createHash('sha256').update(credential).digest('hex').slice(0, 16);
  return `${base}:user:${fingerprint}`;
}

/** Reserve one physical attempt across every process before opening the request. */
export async function reserveProviderRequest(
  providerName: string,
  keyOwner: KeyOwner = 'owner',
  scopeOverride?: string,
): Promise<void> {
  if (!scannerConfig.quotaEnabled) {
    void recordProviderRequest(providerName, keyOwner);
    return;
  }
  const scope = scopeOverride ?? providerScopeForName(providerName);
  const store = getSharedCacheStore();
  try {
    const decision = await reserveRequest(store, scope, Date.now(), getProviderBudget(scope));
    if (decision.allowed) {
      void recordProviderRequest(providerName, keyOwner);
      return;
    }
    if (!scannerConfig.quotaEnforce) {
      console.warn(`[market-data] quota (observe) would block ${scope}: ${decision.reason}`);
      await recordRequest(store, scope, Date.now());
      void recordProviderRequest(providerName, keyOwner);
      return;
    }
    throw new ProviderQuotaError(`upstream quota exceeded for ${scope}: ${decision.reason}`);
  } catch (error) {
    if (error instanceof ProviderQuotaError) throw error;
    if (!scannerConfig.quotaEnforce) {
      console.warn(`[market-data] quota coordination unavailable for ${scope}; observe mode allows request`);
      void recordProviderRequest(providerName, keyOwner);
      return;
    }
    throw new ProviderQuotaError(`quota coordination unavailable for ${scope}`);
  }
}

/** Fetch wrapper used at the actual HTTP boundary, so fallbacks count separately. */
export async function fetchWithProviderQuota(
  providerName: string,
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
  keyOwner: KeyOwner = 'owner',
  scopeOverride?: string,
): Promise<Response> {
  await reserveProviderRequest(providerName, keyOwner, scopeOverride);
  return fetch(input, init);
}

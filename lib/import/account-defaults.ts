import type { AccountRecord } from '@/lib/db/schema';

export interface ImportAccountDefaults {
  name: string;
  type: string;
  wasBrokerDetected: boolean;
}

function canonicalBrokerName(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized === 'ibkr' || normalized.includes('interactivebrokers')) return 'ibkr';
  if (normalized === 'schwab' || normalized.includes('charlesschwab')) return 'schwab';
  if (normalized.startsWith('etrade')) return 'etrade';
  if (normalized.startsWith('fidelity')) return 'fidelity';
  if (normalized.startsWith('robinhood')) return 'robinhood';
  if (normalized.startsWith('webull')) return 'webull';
  if (normalized.startsWith('metatrader')) return 'metatrader';
  if (normalized.startsWith('esignal')) return 'esignal';
  return normalized;
}

export function getRecommendedImportAccountId(
  accounts: AccountRecord[],
  detectedBrokerName?: string | null,
  suggestedCurrency?: string | null,
): string {
  if (!detectedBrokerName) return 'new';

  const broker = canonicalBrokerName(detectedBrokerName);
  const currency = (suggestedCurrency || 'USD').toUpperCase();
  const matches = accounts.filter((account) => (
    canonicalBrokerName(account.type) === broker
    && account.currency.toUpperCase() === currency
  ));

  return matches.length === 1 ? matches[0].accountId : 'new';
}

export function getImportAccountDefaults(detectedBrokerName?: string | null): ImportAccountDefaults {
  const brokerName = detectedBrokerName?.trim();
  if (!brokerName) {
    return {
      name: 'Main Trading Account',
      type: 'Custom',
      wasBrokerDetected: false,
    };
  }

  return {
    name: `${brokerName} Account`,
    type: brokerName,
    wasBrokerDetected: true,
  };
}

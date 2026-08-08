import esignal from './brokers/esignal/adapter';
import fidelity from './brokers/fidelity/adapter';
import ibkr from './brokers/ibkr/adapter';
import robinhood from './brokers/robinhood/adapter';
import schwab from './brokers/schwab/adapter';
import webull from './brokers/webull/adapter';
import type { BrokerAdapter, BrokerImportResult, BrokerImportSource } from './brokers/types';

export const BROKER_ADAPTERS: readonly BrokerAdapter[] = [
  ibkr,
  esignal,
  schwab,
  fidelity,
  robinhood,
  webull,
];

export async function detectAndParseBroker(
  source: BrokerImportSource,
): Promise<BrokerImportResult | undefined> {
  for (const adapter of BROKER_ADAPTERS) {
    if (await adapter.detect(source)) return adapter.parse(source);
  }
  return undefined;
}

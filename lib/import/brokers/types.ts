import type { NormalizedTransaction } from '../types';

export type BrokerId = 'ibkr' | 'schwab' | 'fidelity' | 'robinhood' | 'webull' | 'esignal';

export interface BrokerImportSource {
  content: string;
  filename?: string;
}

export interface BrokerImportResult {
  brokerId: BrokerId;
  brokerName: string;
  format: string;
  transactions: NormalizedTransaction[];
  warnings: string[];
}

export interface BrokerAdapter {
  id: BrokerId;
  name: string;
  detect(source: BrokerImportSource): boolean | Promise<boolean>;
  parse(source: BrokerImportSource): Promise<BrokerImportResult>;
}

export function result(
  adapter: Pick<BrokerAdapter, 'id' | 'name'>,
  format: string,
  transactions: NormalizedTransaction[],
  warnings: string[] = [],
): BrokerImportResult {
  return {
    brokerId: adapter.id,
    brokerName: adapter.name,
    format,
    transactions,
    warnings,
  };
}

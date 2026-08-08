import type { BrokerImportSource } from './brokers/types';

const BROKER_MARKERS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'Charles Schwab', pattern: /\b(?:charles\s+schwab|schwab)\b/i },
  { name: 'IBKR', pattern: /\b(?:ibkr|interactive\s+brokers?)\b/i },
  { name: 'E*TRADE', pattern: /\b(?:e\s*\*?\s*trade|etrade)\b/i },
  { name: 'Fidelity', pattern: /\bfidelity\b/i },
  { name: 'Robinhood', pattern: /\brobinhood\b/i },
  { name: 'Webull', pattern: /\bwebull\b/i },
  { name: 'MetaTrader', pattern: /\bmeta\s*trader\b|\bmetatrader\b/i },
  { name: 'eSignal', pattern: /\be\s*signal\b|\besignal\b/i },
];

export function inferBrokerName(source: BrokerImportSource): string | null {
  const filename = (source.filename || '').replace(/[_-]+/g, ' ');
  const searchable = `${filename}\n${source.content.slice(0, 20_000)}`;
  return BROKER_MARKERS.find((broker) => broker.pattern.test(searchable))?.name || null;
}

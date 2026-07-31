export type SymbolSearchCategory = 'stocks' | 'crypto' | 'futures' | 'all';

export interface SymbolSearchCandidate {
  symbol: string;
  exchangeCode: string;
  type: string;
}

// Yahoo exchange codes for US-listed securities covered by the scanner's
// Tiingo/IEX equity path. OTC and foreign venues are intentionally excluded.
const US_LISTED_EXCHANGES = new Set([
  'ASE', // NYSE American
  'BTS', // Cboe BZX
  'NCM', // Nasdaq Capital Market
  'NGM', // Nasdaq Global Market
  'NMS', // Nasdaq Global Select Market
  'NYQ', // New York Stock Exchange
  'PCX', // NYSE Arca
]);

const isSupportedStock = ({ exchangeCode, type }: SymbolSearchCandidate) =>
  (type === 'EQUITY' || type === 'ETF')
  && US_LISTED_EXCHANGES.has(exchangeCode);

const isSupportedCrypto = ({ symbol, type }: SymbolSearchCandidate) =>
  type === 'CRYPTOCURRENCY' && symbol.endsWith('-USD');

const isSupportedFuture = ({ symbol, type }: SymbolSearchCandidate) =>
  type === 'FUTURE' && symbol.endsWith('=F');

export function isSupportedSymbolSearchCandidate(
  candidate: SymbolSearchCandidate,
  category: SymbolSearchCategory,
) {
  if (category === 'stocks') return isSupportedStock(candidate);
  if (category === 'crypto') return isSupportedCrypto(candidate);
  if (category === 'futures') return isSupportedFuture(candidate);
  return isSupportedStock(candidate)
    || isSupportedCrypto(candidate)
    || isSupportedFuture(candidate);
}

export function parseSymbolSearchCategory(
  value: string | null,
): SymbolSearchCategory {
  return value === 'crypto' || value === 'futures' || value === 'all'
    ? value
    : 'stocks';
}

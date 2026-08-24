export type AssetClass = 'equity' | 'future';

export interface InstrumentDetails {
  symbol: string;
  assetClass: AssetClass;
  multiplier: number;
  quoteProvider: 'Yahoo Finance';
}

interface FuturesSpec {
  multiplier: number;
}

const FUTURES_SPECS: Record<string, FuturesSpec> = {
  ES: { multiplier: 50 },
  MES: { multiplier: 5 },
  NQ: { multiplier: 20 },
  MNQ: { multiplier: 2 },
  YM: { multiplier: 5 },
  MYM: { multiplier: 0.5 },
  RTY: { multiplier: 50 },
  M2K: { multiplier: 5 },
  CL: { multiplier: 1000 },
  MCL: { multiplier: 100 },
  GC: { multiplier: 100 },
  MGC: { multiplier: 10 },
  SI: { multiplier: 5000 },
  SIL: { multiplier: 1000 },
  BTC: { multiplier: 5 },
  MBT: { multiplier: 0.1 },
  // European index futures (IBKR-served). Point values per exchange contract spec.
  DAX: { multiplier: 25 }, FDAX: { multiplier: 25 }, // DAX 40 — €25/pt
  ESTX50: { multiplier: 10 }, FSTX: { multiplier: 10 }, // EURO STOXX 50 — €10/pt
  CAC40: { multiplier: 10 }, FCE: { multiplier: 10 }, // CAC 40 — €10/pt
  IBEX35: { multiplier: 10 }, // IBEX 35 — €10/pt
  SMI: { multiplier: 10 }, FSMI: { multiplier: 10 }, // SMI — CHF 10/pt
};

const DATED_FUTURES_RE = /^([A-Z]{1,4})[FGHJKMNQUVXZ]\d{1,2}$/;

export function getFuturesRoot(rawSymbol: string): string | null {
  let symbol = rawSymbol.trim().toUpperCase();
  if (!symbol) return null;

  if (symbol.startsWith('/')) symbol = symbol.slice(1);
  symbol = symbol.replace(/=F$/, '').replace(/\.C\.0$/, '');

  const datedContract = symbol.match(DATED_FUTURES_RE);
  const root = datedContract?.[1] ?? symbol;
  return FUTURES_SPECS[root] ? root : null;
}

export function getInstrumentDetails(rawSymbol: string): InstrumentDetails {
  const normalized = rawSymbol.trim().toUpperCase();
  const futuresRoot = getFuturesRoot(normalized);

  if (futuresRoot) {
    return {
      symbol: `${futuresRoot}=F`,
      assetClass: 'future',
      multiplier: FUTURES_SPECS[futuresRoot].multiplier,
      quoteProvider: 'Yahoo Finance',
    };
  }

  return {
    symbol: normalized,
    assetClass: 'equity',
    multiplier: 1,
    quoteProvider: 'Yahoo Finance',
  };
}

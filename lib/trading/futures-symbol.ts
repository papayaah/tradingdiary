export interface ParsedFuturesSymbol {
  root: string;
  contractMonth?: string;
  hasFuturesNotation: boolean;
}

const MONTH_CODES = 'FGHJKMNQUVXZ';
const DATED_CONTRACT = /^([A-Z][A-Z0-9]{0,5}?)([FGHJKMNQUVXZ])(\d{1,2})$/;
const IBKR_LOCAL_CONTRACT = /^([A-Z][A-Z0-9]{0,5})\s+(\d{8})(?:\s+[A-Z0-9]+)?$/;

/** Read the broker's contract identity without discarding its expiry. */
export function parseFuturesSymbol(rawSymbol: string, referenceDate?: string): ParsedFuturesSymbol {
  let symbol = rawSymbol.trim().toUpperCase();
  const localContract = symbol.match(IBKR_LOCAL_CONTRACT);
  if (localContract) {
    return { root: localContract[1], contractMonth: localContract[2], hasFuturesNotation: true };
  }

  const hasFuturesNotation = symbol.startsWith('/') || symbol.endsWith('=F') || symbol.includes('.C.0');
  if (symbol.startsWith('/')) symbol = symbol.slice(1);
  symbol = symbol.replace(/=F$/, '').replace(/\.C\.0.*$/, '');
  const datedContract = symbol.match(DATED_CONTRACT);
  if (!datedContract) return { root: symbol, hasFuturesNotation };

  // One-digit years are relative to the trade's date, rather than today's
  // front month, so an old imported contract retains its original identity.
  const referenceYear = referenceDate && /^\d{8}$/.test(referenceDate)
    ? Number(referenceDate.slice(0, 4))
    : new Date().getUTCFullYear();
  const yearDigits = datedContract[3];
  const cycle = yearDigits.length === 1 ? 10 : 100;
  const baseYear = Math.floor(referenceYear / cycle) * cycle + Number(yearDigits);
  const year = [baseYear - cycle, baseYear, baseYear + cycle]
    .sort((a, b) => Math.abs(a - referenceYear) - Math.abs(b - referenceYear))[0];
  const month = String(MONTH_CODES.indexOf(datedContract[2]) + 1).padStart(2, '0');
  return {
    root: datedContract[1],
    contractMonth: `${year}${month}`,
    hasFuturesNotation: true,
  };
}

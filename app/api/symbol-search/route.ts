import { NextRequest, NextResponse } from 'next/server';
import { recordProviderRequest } from '@/lib/metrics/provider-usage';
import {
  isSupportedSymbolSearchCandidate,
  parseSymbolSearchCategory,
} from '@/lib/market/symbol-search';

// Symbol autocomplete backed by Yahoo's free search endpoint (the same one its
// own site uses). Server-proxied because the browser cannot call Yahoo directly
// (CORS). Free, and covers equities, ETFs, crypto, futures and indices in the
// exact symbol format this app uses (e.g. BTC-USD, ES=F).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface YahooQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
  exchange?: string;
  quoteType?: string;
}

export interface SymbolSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim();
  const category = parseSymbolSearchCategory(
    request.nextUrl.searchParams.get('category'),
  );
  // Allow single-character queries so real single-letter tickers (U, W, F, T, X)
  // autocomplete and validate. Empty still returns nothing.
  if (!q) {
    return NextResponse.json({ results: [] });
  }

  try {
    const url =
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}` +
      `&quotesCount=20&newsCount=0&listsCount=0&enableFuzzyQuery=false`;
    void recordProviderRequest('Yahoo Finance', 'owner');
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 3600 }, // symbol metadata is stable; cache to cut outbound calls
    });
    if (!res.ok) {
      return NextResponse.json({ results: [] });
    }

    const data = (await res.json()) as { quotes?: YahooQuote[] };
    const quotes = Array.isArray(data.quotes) ? data.quotes : [];
    const results: SymbolSearchResult[] = quotes
      .filter((quote): quote is YahooQuote & { symbol: string } => typeof quote.symbol === 'string' && quote.symbol.length > 0)
      .filter((quote) => isSupportedSymbolSearchCandidate({
        symbol: quote.symbol.toUpperCase(),
        exchangeCode: (quote.exchange || '').toUpperCase(),
        type: (quote.quoteType || '').toUpperCase(),
      }, category))
      .map((quote) => ({
        symbol: quote.symbol.toUpperCase(),
        name: quote.shortname || quote.longname || '',
        exchange: quote.exchDisp || quote.exchange || '',
        type: quote.quoteType || '',
      }))
      .slice(0, 10);

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}

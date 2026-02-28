import { NextRequest, NextResponse } from 'next/server';

/**
 * Fetches stock prices from Yahoo Finance's v8 chart API.
 *
 * Current prices:
 *   GET /api/quotes?symbols=AAPL,MSFT,U
 *   Returns: { AAPL: 150.23, MSFT: 410.5, U: 25.1 }
 *
 * Historical closing prices:
 *   GET /api/quotes?symbols=U,HOOD&from=20260224&to=20260226
 *   Returns: { U: { "20260224": 24.5, "20260225": 25.1, "20260226": 25.3 },
 *              HOOD: { "20260224": 60.2, ... } }
 */
export async function GET(request: NextRequest) {
  const symbols = request.nextUrl.searchParams.get('symbols');
  if (!symbols) {
    return NextResponse.json({ error: 'Missing symbols parameter' }, { status: 400 });
  }

  const symbolList = symbols.split(',').map((s) => s.trim()).filter(Boolean);
  const from = request.nextUrl.searchParams.get('from');
  const to = request.nextUrl.searchParams.get('to');

  if (from && to) {
    return fetchHistorical(symbolList, from, to);
  }

  return fetchCurrent(symbolList);
}

async function fetchCurrent(symbolList: string[]) {
  const quotes: Record<string, number> = {};

  await Promise.allSettled(
    symbolList.map(async (symbol) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        next: { revalidate: 300 },
      });

      if (!res.ok) return;

      const data = await res.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price != null) {
        quotes[symbol] = price;
      }
    })
  );

  if (Object.keys(quotes).length === 0) {
    return NextResponse.json({ error: 'Failed to fetch any quotes' }, { status: 502 });
  }

  return NextResponse.json(quotes);
}

function yyyymmddToUnix(dateStr: string): number {
  const y = parseInt(dateStr.substring(0, 4));
  const m = parseInt(dateStr.substring(4, 6)) - 1;
  const d = parseInt(dateStr.substring(6, 8));
  return Math.floor(new Date(y, m, d).getTime() / 1000);
}

function unixToYyyymmdd(ts: number): string {
  const d = new Date(ts * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

async function fetchHistorical(symbolList: string[], from: string, to: string) {
  // Add 1 day buffer on each side to handle timezone differences
  const period1 = yyyymmddToUnix(from) - 86400;
  const period2 = yyyymmddToUnix(to) + 86400 * 2;

  const result: Record<string, Record<string, number>> = {};

  await Promise.allSettled(
    symbolList.map(async (symbol) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        next: { revalidate: 3600 }, // historical data rarely changes
      });

      if (!res.ok) return;

      const data = await res.json();
      const chart = data?.chart?.result?.[0];
      if (!chart) return;

      const timestamps: number[] = chart.timestamp ?? [];
      const closes: number[] = chart.indicators?.quote?.[0]?.close ?? [];

      const pricesByDate: Record<string, number> = {};
      for (let i = 0; i < timestamps.length; i++) {
        if (closes[i] != null) {
          const dateKey = unixToYyyymmdd(timestamps[i]);
          pricesByDate[dateKey] = closes[i];
        }
      }

      // Also include the current price for the latest date
      const currentPrice = chart.meta?.regularMarketPrice;
      if (currentPrice != null) {
        const today = unixToYyyymmdd(Math.floor(Date.now() / 1000));
        pricesByDate[today] = currentPrice;
      }

      if (Object.keys(pricesByDate).length > 0) {
        result[symbol] = pricesByDate;
      }
    })
  );

  if (Object.keys(result).length === 0) {
    return NextResponse.json({ error: 'Failed to fetch any historical quotes' }, { status: 502 });
  }

  return NextResponse.json(result);
}

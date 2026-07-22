import { OHLCCandle } from "./types";

export interface ChartProvider {
    name: string;
    fetchCandles(symbol: string, date: string, interval: string): Promise<OHLCCandle[]>;
    fetchRecentCandles(symbol: string, interval: string): Promise<OHLCCandle[]>;
}

/**
 * Polygon.io Provider (Highly Reliable)
 */
class PolygonProvider implements ChartProvider {
    name = "Polygon.io";
    async fetchCandles(symbol: string, date: string, interval: string): Promise<OHLCCandle[]> {
        const apiKey = process.env.POLYGON_API_KEY;
        if (!apiKey) throw new Error("Missing POLYGON_API_KEY");

        const formattedDate = `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`;
        const isSecond = interval.endsWith('s');
        const multiplier = parseInt(interval.replace(/[ms]/g, '')) || 1;
        const timescale = isSecond ? 'second' : 'minute';
        
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol.toUpperCase()}/range/${multiplier}/${timescale}/${formattedDate}/${formattedDate}?adjusted=true&sort=asc&limit=50000&extended_hours=true&apiKey=${apiKey}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Polygon API error: ${res.status}`);

        const data = await res.json();
        if (!data.results) return [];

        return data.results.map((r: any) => ({
            time: Math.floor(r.t / 1000), // ms -> sec
            open: r.o,
            high: r.h,
            low: r.l,
            close: r.c,
            volume: r.v,
        }));
    }

    async fetchRecentCandles(symbol: string, interval: string): Promise<OHLCCandle[]> {
        const apiKey = process.env.POLYGON_API_KEY;
        if (!apiKey) throw new Error("Missing POLYGON_API_KEY");

        // Fetch last 3 days to cover weekends/holidays
        const end = new Date();
        const start = new Date(end.getTime() - 3 * 24 * 60 * 60 * 1000);
        const formatDate = (d: Date) => d.toISOString().split('T')[0];
        
        const formattedStart = formatDate(start);
        const formattedEnd = formatDate(end);
        const isSecond = interval.endsWith('s');
        const multiplier = parseInt(interval.replace(/[ms]/g, '')) || 1;
        const timescale = isSecond ? 'second' : 'minute';
        
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol.toUpperCase()}/range/${multiplier}/${timescale}/${formattedStart}/${formattedEnd}?adjusted=true&sort=asc&limit=50000&extended_hours=true&apiKey=${apiKey}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Polygon API error: ${res.status}`);

        const data = await res.json();
        if (!data.results) return [];

        return data.results.map((r: any) => ({
            time: Math.floor(r.t / 1000), // ms -> sec
            open: r.o,
            high: r.h,
            low: r.l,
            close: r.c,
            volume: r.v,
        }));
    }
}

/**
 * Alpaca Provider (Placeholder for future use)
 */
class AlpacaProvider implements ChartProvider {
    name = "Alpaca";
    async fetchCandles(symbol: string, date: string, interval: string): Promise<OHLCCandle[]> {
        // This is a placeholder for when you want to swap to Alpaca
        throw new Error("Alpaca provider not yet implemented");
    }

    async fetchRecentCandles(symbol: string, interval: string): Promise<OHLCCandle[]> {
        throw new Error("Alpaca provider not yet implemented");
    }
}

function aggregateYahooCandles(candles: OHLCCandle[], factor: number): OHLCCandle[] {
    const aggregated: OHLCCandle[] = [];
    for (let i = 0; i < candles.length; i += factor) {
        const chunk = candles.slice(i, i + factor);
        if (chunk.length === 0) continue;
        
        const open = chunk[0].open;
        const close = chunk[chunk.length - 1].close;
        const high = Math.max(...chunk.map(c => c.high));
        const low = Math.min(...chunk.map(c => c.low));
        const volume = chunk.reduce((sum, c) => sum + c.volume, 0);
        const time = chunk[0].time;
        
        aggregated.push({ time, open, high, low, close, volume });
    }
    return aggregated;
}

/**
 * Yahoo Finance Provider (Free Fallback, less reliable)
 */
class YahooProvider implements ChartProvider {
    name = "Yahoo Finance";
    async fetchCandles(symbol: string, date: string, interval: string): Promise<OHLCCandle[]> {
        const needsAggregation = interval === '10m';
        const fetchInterval = needsAggregation ? '5m' : interval;
        const cleanSymbol = symbol.startsWith('/') ? symbol.substring(1) : symbol;

        const year = parseInt(date.substring(0, 4));
        const month = parseInt(date.substring(4, 6)) - 1;
        const day = parseInt(date.substring(6, 8));

        const period1 = Math.floor(Date.UTC(year, month, day, 4, 0, 0) / 1000);
        const period2 = Math.floor(Date.UTC(year, month, day + 1, 4, 0, 0) / 1000);

        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}?period1=${period1}&period2=${period2}&interval=${fetchInterval}&includePrePost=true`;

        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) throw new Error(`Yahoo Finance error: ${res.status}`);

        const data = await res.json();
        const result = data?.chart?.result?.[0];
        if (!result) return [];

        const timestamps = result.timestamp || [];
        const quote = result.indicators?.quote?.[0] || {};
        const { open, high, low, close, volume } = quote;

        const candles: OHLCCandle[] = [];
        for (let i = 0; i < timestamps.length; i++) {
            if (open[i] != null && high[i] != null && low[i] != null && close[i] != null) {
                candles.push({
                    time: timestamps[i],
                    open: open[i],
                    high: high[i],
                    low: low[i],
                    close: close[i],
                    volume: volume?.[i] || 0,
                });
            }
        }

        if (needsAggregation) {
            return aggregateYahooCandles(candles, 2);
        }

        return candles;
    }

    async fetchRecentCandles(symbol: string, interval: string): Promise<OHLCCandle[]> {
        const needsAggregation = interval === '10m';
        const fetchInterval = needsAggregation ? '5m' : interval;
        const cleanSymbol = symbol.startsWith('/') ? symbol.substring(1) : symbol;

        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}?interval=${fetchInterval}&range=2d&includePrePost=true`;

        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) throw new Error(`Yahoo Finance error: ${res.status}`);

        const data = await res.json();
        const result = data?.chart?.result?.[0];
        if (!result) return [];

        const timestamps = result.timestamp || [];
        const quote = result.indicators?.quote?.[0] || {};
        const { open, high, low, close, volume } = quote;

        const candles: OHLCCandle[] = [];
        for (let i = 0; i < timestamps.length; i++) {
            if (open[i] != null && high[i] != null && low[i] != null && close[i] != null) {
                candles.push({
                    time: timestamps[i],
                    open: open[i],
                    high: high[i],
                    low: low[i],
                    close: close[i],
                    volume: volume?.[i] || 0,
                });
            }
        }

        if (needsAggregation) {
            return aggregateYahooCandles(candles, 2);
        }

        return candles;
    }
}

/**
 * Factory to get the active provider based on environment variables.
 * Easy to prioritize which one to use.
 */
export function getActiveProvider(symbol?: string): ChartProvider {
    // If it's a Yahoo-specific ticker format (starts with ^, starts with /, or ends with =F), force YahooProvider
    if (symbol) {
        const upper = symbol.toUpperCase();
        if (upper.startsWith('^') || upper.startsWith('/') || upper.endsWith('=F') || upper.includes('=')) {
            return new YahooProvider();
        }
    }

    // Priority 1: Polygon
    if (process.env.POLYGON_API_KEY) {
        return new PolygonProvider();
    }
    
    // Priority 2: Alpaca (if you add ALPACA_API_KEY later)
    if (process.env.ALPACA_API_KEY) {
        return new AlpacaProvider();
    }

    // Default: Yahoo
    return new YahooProvider();
}

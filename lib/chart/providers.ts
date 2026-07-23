import { OHLCCandle } from "./types";

interface PolygonAggregate {
    t: number; // timestamp (ms)
    o: number; // open
    h: number; // high
    l: number; // low
    c: number; // close
    v: number; // volume
}

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

        return data.results.map((r: PolygonAggregate) => ({
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

        return data.results.map((r: PolygonAggregate) => ({
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
    const intervalSeconds = factor * 5 * 60; // e.g., 2 * 5m = 10m (600s)
    const groups = new Map<number, OHLCCandle[]>();

    for (const c of candles) {
        const bucketTime = Math.floor(c.time / intervalSeconds) * intervalSeconds;
        if (!groups.has(bucketTime)) {
            groups.set(bucketTime, []);
        }
        groups.get(bucketTime)!.push(c);
    }

    const aggregated: OHLCCandle[] = [];
    for (const [time, chunk] of groups.entries()) {
        const open = chunk[0].open;
        const close = chunk[chunk.length - 1].close;
        const high = Math.max(...chunk.map(c => c.high));
        const low = Math.min(...chunk.map(c => c.low));
        const volume = chunk.reduce((sum, c) => sum + c.volume, 0);

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
 * Twelve Data Provider (Free tier: 8 API calls/min, 800/day, real-time US equities)
 */
class TwelveDataProvider implements ChartProvider {
    name = "Twelve Data";

    async fetchCandles(symbol: string, date: string, interval: string): Promise<OHLCCandle[]> {
        return this.fetchRecentCandles(symbol, interval);
    }

    async fetchRecentCandles(symbol: string, interval: string): Promise<OHLCCandle[]> {
        const apiKey = process.env.TWELVE_DATA_API_KEY;
        if (!apiKey) throw new Error("Missing TWELVE_DATA_API_KEY");

        const needsAggregation = interval === '10m' || interval === '2m';
        let fetchInterval = interval;
        if (interval === '10m') fetchInterval = '5m';
        if (interval === '2m') fetchInterval = '1m';

        const cleanSymbol = symbol.toUpperCase();
        const url = `https://api.twelvedata.com/time_series?symbol=${cleanSymbol}&interval=${fetchInterval}&outputsize=250&apikey=${apiKey}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Twelve Data API error: ${res.status}`);

        const data = await res.json();
        if (data.status === 'error') {
            throw new Error(`Twelve Data error: ${data.message}`);
        }

        const values = data.values || [];
        // Twelve Data returns newest first, so reverse to chronological order
        const candles: OHLCCandle[] = values.slice().reverse().map((v: any) => ({
            time: Math.floor(new Date(v.datetime).getTime() / 1000),
            open: parseFloat(v.open),
            high: parseFloat(v.high),
            low: parseFloat(v.low),
            close: parseFloat(v.close),
            volume: parseInt(v.volume) || 0,
        }));

        if (needsAggregation) {
            return aggregateYahooCandles(candles, 2);
        }

        return candles;
    }
}

/**
 * Tiingo IEX Provider
 */
class TiingoProvider implements ChartProvider {
    name = "Tiingo";
    apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    private mapInterval(interval: string): string {
        const val = parseInt(interval.replace(/[ms]/g, '')) || 5;
        const isHour = interval.endsWith('h');
        if (isHour) {
            return `${val}hour`;
        }
        return `${val}min`;
    }

    async fetchCandles(symbol: string, date: string, interval: string): Promise<OHLCCandle[]> {
        const formattedDate = `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`;
        const freq = this.mapInterval(interval);
        const url = `https://api.tiingo.com/iex/${symbol.toUpperCase()}/prices?startDate=${formattedDate}&endDate=${formattedDate}&resampleFreq=${freq}&token=${this.apiKey}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Tiingo API error: ${res.status}`);

        const data = await res.json();
        if (!Array.isArray(data)) return [];

        return data.map((r: any) => ({
            time: Math.floor(new Date(r.date).getTime() / 1000),
            open: r.open,
            high: r.high,
            low: r.low,
            close: r.close,
            volume: r.volume || 0,
        }));
    }

    async fetchRecentCandles(symbol: string, interval: string): Promise<OHLCCandle[]> {
        const end = new Date();
        const start = new Date(end.getTime() - 3 * 24 * 60 * 60 * 1000);
        const formatDate = (d: Date) => d.toISOString().split('T')[0];
        const formattedStart = formatDate(start);
        const formattedEnd = formatDate(end);
        
        const freq = this.mapInterval(interval);
        const url = `https://api.tiingo.com/iex/${symbol.toUpperCase()}/prices?startDate=${formattedStart}&endDate=${formattedEnd}&resampleFreq=${freq}&token=${this.apiKey}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Tiingo API error: ${res.status}`);

        const data = await res.json();
        if (!Array.isArray(data)) return [];

        return data.map((r: any) => ({
            time: Math.floor(new Date(r.date).getTime() / 1000),
            open: r.open,
            high: r.high,
            low: r.low,
            close: r.close,
            volume: r.volume || 0,
        }));
    }
}

export interface UserProviderConfig {
    preferredProvider?: string;
    alpacaKeyId?: string;
    alpacaSecret?: string;
    twelveKey?: string;
    polygonKey?: string;
    tiingoKey?: string;
}

/**
 * Factory to get the active provider based on environment variables or user config.
 * Falls back safely to Yahoo Finance if selected provider lacks an API key.
 */
export function getActiveProvider(symbol?: string, userConfig?: UserProviderConfig): ChartProvider {
    // If it's a Yahoo-specific ticker format (starts with ^, starts with /, or ends with =F), force YahooProvider
    if (symbol) {
        const upper = symbol.toUpperCase();
        if (upper.startsWith('^') || upper.startsWith('/') || upper.endsWith('=F') || upper.includes('=')) {
            return new YahooProvider();
        }
    }

    const pref = userConfig?.preferredProvider || 'auto';

    if (pref === 'alpaca') {
        const keyId = userConfig?.alpacaKeyId || process.env.ALPACA_API_KEY_ID || process.env.ALPACA_API_KEY;
        const secret = userConfig?.alpacaSecret || process.env.ALPACA_SECRET_KEY || process.env.ALPACA_API_SECRET;
        if (keyId && secret) return new AlpacaProvider();
    }

    if (pref === 'twelve') {
        const key = userConfig?.twelveKey || process.env.TWELVE_DATA_API_KEY;
        if (key) return new TwelveDataProvider();
    }

    if (pref === 'polygon') {
        const key = userConfig?.polygonKey || process.env.POLYGON_API_KEY;
        if (key) return new PolygonProvider();
    }

    if (pref === 'tiingo') {
        const key = userConfig?.tiingoKey || process.env.TIINGO_API_KEY;
        if (key) return new TiingoProvider(key);
    }

    if (pref === 'yahoo') {
        return new YahooProvider();
    }

    // Default 'auto' fallback chain:
    if (userConfig?.alpacaKeyId || process.env.ALPACA_API_KEY_ID || process.env.ALPACA_API_KEY) {
        return new AlpacaProvider();
    }

    if (userConfig?.twelveKey || process.env.TWELVE_DATA_API_KEY) {
        return new TwelveDataProvider();
    }

    if (userConfig?.polygonKey || process.env.POLYGON_API_KEY) {
        return new PolygonProvider();
    }

    if (userConfig?.tiingoKey || process.env.TIINGO_API_KEY) {
        return new TiingoProvider(userConfig?.tiingoKey || process.env.TIINGO_API_KEY || '');
    }

    // Default: Yahoo
    return new YahooProvider();
}

import { OHLCCandle } from "./types";

interface PolygonAggregate {
    t: number; // timestamp (ms)
    o: number; // open
    h: number; // high
    l: number; // low
    c: number; // close
    v: number; // volume
}

interface IntradayPriceRecord {
    date?: string;
    datetime?: string;
    open: number | string;
    high: number | string;
    low: number | string;
    close: number | string;
    volume?: number | string;
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
export class YahooProvider implements ChartProvider {
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
        const candles: OHLCCandle[] = values.slice().reverse().map((v: IntradayPriceRecord) => ({
            time: Math.floor(new Date(v.datetime || v.date || '').getTime() / 1000),
            open: Number(v.open),
            high: Number(v.high),
            low: Number(v.low),
            close: Number(v.close),
            volume: Number(v.volume || 0),
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

    private async fetchIntraday(
        symbol: string,
        startDate: string,
        interval: string,
        endDate?: string,
    ): Promise<OHLCCandle[]> {
        const freq = this.mapInterval(interval);
        const dateParams = `startDate=${startDate}${endDate ? `&endDate=${endDate}` : ''}`;
        const query = `${dateParams}&resampleFreq=${freq}&afterHours=true&token=${this.apiKey}`;
        const cleanSymbol = symbol.toUpperCase();

        // The consolidated equity feed covers the full 4:00 AM–8:00 PM ET
        // session. Keep IEX as a compatibility fallback for accounts that
        // haven't been enabled for the newer endpoint yet.
        const urls = [
            `https://api.tiingo.com/tiingo/equity/intraday/${cleanSymbol}/prices?${query}`,
            `https://api.tiingo.com/iex/${cleanSymbol}/prices?${query}`,
        ];

        let lastStatus = 500;
        for (const url of urls) {
            const res = await fetch(url);
            lastStatus = res.status;
            if (!res.ok) continue;

            const data = await res.json();
            if (!Array.isArray(data)) continue;
            return data.map((r: IntradayPriceRecord) => ({
                time: Math.floor(new Date(r.date || r.datetime || '').getTime() / 1000),
                open: Number(r.open),
                high: Number(r.high),
                low: Number(r.low),
                close: Number(r.close),
                volume: Number(r.volume || 0),
            }));
        }

        throw new Error(`Tiingo API error: ${lastStatus}`);
    }

    async fetchCandles(symbol: string, date: string, interval: string): Promise<OHLCCandle[]> {
        const formattedDate = `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`;
        return this.fetchIntraday(symbol, formattedDate, interval, formattedDate);
    }

    async fetchRecentCandles(symbol: string, interval: string): Promise<OHLCCandle[]> {
        const start = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        const formatDate = (d: Date) => d.toISOString().split('T')[0];
        const formattedStart = formatDate(start);
        // Omitting endDate asks Tiingo for all data through the current moment.
        return this.fetchIntraday(symbol, formattedStart, interval);
    }
}

function aggregate1mCandles(candles: OHLCCandle[], targetInterval: string): OHLCCandle[] {
    const minutes = parseInt(targetInterval.replace(/[ms]/g, '')) || 1;
    if (minutes <= 1) return candles;
    const intervalSeconds = minutes * 60;
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
 * Databento CME Futures Provider (GLBX.MDP3)
 */
export class DatabentoProvider implements ChartProvider {
    name = "Databento (GLBX.MDP3 CME)";
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    private mapSymbol(symbol: string): string {
        let clean = symbol.toUpperCase().trim();
        if (clean.endsWith('=F')) {
            clean = clean.replace('=F', '');
        }
        if (!clean.includes('.')) {
            clean = `${clean}.c.0`;
        }
        return clean;
    }

    async fetchCandles(symbol: string, date: string, interval: string): Promise<OHLCCandle[]> {
        return this.fetchRecentCandles(symbol, interval);
    }

    async fetchRecentCandles(symbol: string, interval: string): Promise<OHLCCandle[]> {
        if (!this.apiKey) {
            throw new Error("Missing DATABENTO_API_KEY");
        }

        const dbSymbol = this.mapSymbol(symbol);
        const basicAuth = Buffer.from(this.apiKey.trim() + ':').toString('base64');

        const now = new Date();
        const endHour = new Date(Math.floor(now.getTime() / (60 * 60 * 1000)) * (60 * 60 * 1000));
        const startHour = new Date(endHour.getTime() - 24 * 60 * 60 * 1000);

        const startIso = startHour.toISOString().replace(/\:\d{2}\:\d{2}\.\d{3}Z$/, ':00:00Z');
        const endIso = endHour.toISOString().replace(/\:\d{2}\:\d{2}\.\d{3}Z$/, ':00:00Z');

        const url = `https://hist.databento.com/v0/timeseries.get_range?dataset=GLBX.MDP3&symbols=${dbSymbol}&schema=ohlcv-1m&stype_in=continuous&stype_out=instrument_id&encoding=json&pretty_px=1&pretty_ts=1&start=${startIso}&end=${endIso}`;

        const cleanRoot = symbol.toUpperCase().replace('=F', '').replace(/\..*$/, '').replace(/^\//, '');

        let res = await fetch(url, {
            headers: {
                'Authorization': `Basic ${basicAuth}`
            }
        });

        // Fallback to parent symbology (e.g., NQ.FUT) if continuous symbology fails
        if (!res.ok) {
            const parentSymbol = `${cleanRoot}.FUT`;
            const fallbackUrl = `https://hist.databento.com/v0/timeseries.get_range?dataset=GLBX.MDP3&symbols=${parentSymbol}&schema=ohlcv-1m&stype_in=parent&stype_out=instrument_id&encoding=json&pretty_px=1&pretty_ts=1&start=${startIso}&end=${endIso}`;
            res = await fetch(fallbackUrl, {
                headers: {
                    'Authorization': `Basic ${basicAuth}`
                }
            });
        }

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`Databento API error ${res.status}: ${errText.substring(0, 100)}`);
        }

        const text = await res.text();
        if (!text.trim()) return [];

        const lines = text.trim().split('\n');
        const raw1mCandles: OHLCCandle[] = [];

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const record = JSON.parse(line);
                let sec = 0;
                if (typeof record.ts_event === 'number') {
                    sec = Math.floor(record.ts_event / 1e9);
                } else if (typeof record.ts_event === 'string') {
                    sec = Math.floor(new Date(record.ts_event).getTime() / 1000);
                }
                
                const open = typeof record.open === 'number' ? record.open : parseFloat(record.open);
                const high = typeof record.high === 'number' ? record.high : parseFloat(record.high);
                const low = typeof record.low === 'number' ? record.low : parseFloat(record.low);
                const close = typeof record.close === 'number' ? record.close : parseFloat(record.close);
                const volume = typeof record.volume === 'number' ? record.volume : parseFloat(record.volume || 0);

                if (sec && !isNaN(close)) {
                    raw1mCandles.push({ time: sec, open, high, low, close, volume });
                }
            } catch (e) {
                // skip metadata or non-candle record
            }
        }

        const aggregated = aggregate1mCandles(raw1mCandles, interval);
        aggregated.sort((a, b) => a.time - b.time);
        // Ensure we return the latest candles ending right now!
        return aggregated.slice(-144);
    }
}

export interface UserProviderConfig {
    preferredProvider?: string;
    futuresProvider?: string;
    databentoKey?: string;
    alpacaKeyId?: string;
    alpacaSecret?: string;
    twelveKey?: string;
    polygonKey?: string;
    tiingoKey?: string;
}

/**
 * Factory to get the active provider based on environment variables or user config.
 * Supports distinct routing for Equities vs Futures.
 */
export function getActiveProvider(symbol?: string, userConfig?: UserProviderConfig): ChartProvider {
    const upperSymbol = symbol ? symbol.toUpperCase() : '';
    const isFutures = upperSymbol.endsWith('=F') || upperSymbol.includes('.C.0') || upperSymbol.startsWith('/');

    // Handle Futures Data Feed Selection separately
    if (isFutures) {
        const futuresPref = userConfig?.futuresProvider || 'databento';
        const databentoKey = userConfig?.databentoKey || process.env.DATABENTO_API_KEY;

        if ((futuresPref === 'databento' || futuresPref === 'auto') && databentoKey) {
            return new DatabentoProvider(databentoKey);
        }
        return new YahooProvider();
    }

    // Handle Equities Data Feed Selection
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

    // Default 'auto' fallback chain for Equities:
    if (userConfig?.tiingoKey || process.env.TIINGO_API_KEY) {
        return new TiingoProvider(userConfig?.tiingoKey || process.env.TIINGO_API_KEY || '');
    }

    if (userConfig?.polygonKey || process.env.POLYGON_API_KEY) {
        return new PolygonProvider();
    }

    if (userConfig?.alpacaKeyId || process.env.ALPACA_API_KEY_ID || process.env.ALPACA_API_KEY) {
        return new AlpacaProvider();
    }

    if (userConfig?.twelveKey || process.env.TWELVE_DATA_API_KEY) {
        return new TwelveDataProvider();
    }

    // Default: Yahoo
    return new YahooProvider();
}

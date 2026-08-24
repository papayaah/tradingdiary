import Papa from 'papaparse';
import type { OHLCCandle } from './types';

type TiingoCsvRow = Record<string, string | undefined>;

const INTRADAY_FIELDS = ['date', 'open', 'high', 'low', 'close', 'volume'] as const;
const DAILY_FIELDS = ['date', 'adjOpen', 'adjHigh', 'adjLow', 'adjClose', 'adjVolume'] as const;

function parseRows(csv: string, requiredFields: readonly string[]): TiingoCsvRow[] {
    if (!csv.trim()) return [];

    const result = Papa.parse<TiingoCsvRow>(csv, {
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: (header) => header.replace(/^\uFEFF/, '').trim(),
    });

    if (result.errors.length > 0 && result.data.length === 0) {
        throw new Error(`Tiingo CSV parsing failed: ${result.errors[0]?.message}`);
    }

    const fields = new Set(result.meta.fields ?? []);
    const missingFields = requiredFields.filter((field) => !fields.has(field));
    if (missingFields.length > 0) {
        throw new Error(`Tiingo CSV response is missing columns: ${missingFields.join(', ')}`);
    }

    return result.data;
}

function parseTime(value: string | undefined): number {
    if (!value) return Number.NaN;
    // Tiingo CSV intraday timestamps use `YYYY-MM-DD HH:mm:ss-04:00` while
    // JSON uses an ISO `T`. Normalize it so parsing is consistent in browsers.
    const normalized = /^\d{4}-\d{2}-\d{2} /.test(value)
        ? `${value.slice(0, 10)}T${value.slice(11)}`
        : value;
    return Math.floor(Date.parse(normalized) / 1000);
}

function parseNumber(value: string | undefined): number {
    if (value === undefined || value.trim() === '') return Number.NaN;
    return Number(value);
}

function toCandle(
    row: TiingoCsvRow,
    index: number,
    fields: { open: string; high: string; low: string; close: string; volume: string },
): OHLCCandle {
    const candle: OHLCCandle = {
        time: parseTime(row.date),
        open: parseNumber(row[fields.open]),
        high: parseNumber(row[fields.high]),
        low: parseNumber(row[fields.low]),
        close: parseNumber(row[fields.close]),
        volume: parseNumber(row[fields.volume]),
    };

    if (Object.values(candle).some((value) => !Number.isFinite(value))) {
        throw new Error(`Tiingo CSV contains an invalid candle at row ${index + 2}`);
    }

    return candle;
}

export function parseTiingoIntradayCsv(csv: string): OHLCCandle[] {
    return parseRows(csv, INTRADAY_FIELDS).map((row, index) => toCandle(row, index, {
        open: 'open',
        high: 'high',
        low: 'low',
        close: 'close',
        volume: 'volume',
    }));
}

export function parseTiingoDailyCsv(csv: string): OHLCCandle[] {
    return parseRows(csv, DAILY_FIELDS).map((row, index) => toCandle(row, index, {
        open: 'adjOpen',
        high: 'adjHigh',
        low: 'adjLow',
        close: 'adjClose',
        volume: 'adjVolume',
    }));
}

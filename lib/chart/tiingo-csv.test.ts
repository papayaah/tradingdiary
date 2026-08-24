import { describe, expect, it } from 'vitest';
import { parseTiingoDailyCsv, parseTiingoIntradayCsv } from './tiingo-csv';

describe('Tiingo CSV parsing', () => {
    it('maps intraday OHLCV rows and preserves the UTC instant in offset timestamps', () => {
        const csv = [
            'date,open,high,low,close,volume',
            '2025-07-15 08:20:00-04:00,209.0,210.5,208.75,210.0,1234.0',
        ].join('\n');

        expect(parseTiingoIntradayCsv(csv)).toEqual([{
            time: Date.parse('2025-07-15T12:20:00Z') / 1000,
            open: 209,
            high: 210.5,
            low: 208.75,
            close: 210,
            volume: 1234,
        }]);
    });

    it('uses adjusted EOD fields', () => {
        const csv = [
            'date,close,high,low,open,volume,adjClose,adjHigh,adjLow,adjOpen,adjVolume,divCash,splitFactor',
            '2025-07-15,209.11,211.89,208.92,209.22,42296339,208.09,210.86,207.90,208.20,42296339,0.0,1.0',
        ].join('\n');

        expect(parseTiingoDailyCsv(csv)).toEqual([{
            time: Date.parse('2025-07-15T00:00:00Z') / 1000,
            open: 208.2,
            high: 210.86,
            low: 207.9,
            close: 208.09,
            volume: 42296339,
        }]);
    });

    it('returns no candles for an empty successful response', () => {
        expect(parseTiingoIntradayCsv('')).toEqual([]);
    });

    it('rejects an unexpected response shape instead of creating corrupt candles', () => {
        expect(() => parseTiingoIntradayCsv('{"detail":"unexpected response"}'))
            .toThrow('Tiingo CSV');
    });
});

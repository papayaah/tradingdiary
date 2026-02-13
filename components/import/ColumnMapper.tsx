'use client';

import { useState } from 'react';
import { NormalizedTransaction, ColumnMapping, SideValueMapping } from '@/lib/import/types';

interface ColumnMapperProps {
    headers: string[];
    sampleRows: Record<string, string>[];
    initialMapping: ColumnMapping;
    initialSideMap: SideValueMapping;
    onConfirm: (mapping: ColumnMapping, sideMap: SideValueMapping) => void;
    onCancel: () => void;
}

const SCHEMA_FIELDS: { key: keyof NormalizedTransaction; label: string; recommended?: boolean }[] = [
    { key: 'date', label: 'Date', recommended: true },
    { key: 'symbol', label: 'Symbol / Stock', recommended: true },
    { key: 'side', label: 'Side (Buy/Sell)', recommended: true },
    { key: 'quantity', label: 'Quantity', recommended: true },
    { key: 'price', label: 'Price', recommended: true },
    { key: 'time', label: 'Time' },
    { key: 'orderId', label: 'Order ID' },
    { key: 'commission', label: 'Commission' },
    { key: 'currency', label: 'Currency' },
    { key: 'orderType', label: 'Order Type' },
    { key: 'exchanges', label: 'Exchange' },
    { key: 'totalValue', label: 'Total Value' },
];

export default function ColumnMapper({
    headers,
    sampleRows,
    initialMapping,
    initialSideMap,
    onConfirm,
    onCancel
}: ColumnMapperProps) {
    const [mapping, setMapping] = useState<ColumnMapping>(initialMapping);
    // We don't have UI for side-mapping editing yet, relying on auto-detect or defaults for now
    // but we pass it through.
    const [sideMap, setSideMap] = useState<SideValueMapping>(initialSideMap);

    const handleFieldChange = (scKey: keyof NormalizedTransaction, headerName: string | '') => {
        setMapping(prev => {
            const next = { ...prev };
            if (!headerName) {
                delete next[scKey];
            } else {
                next[scKey] = headerName;
            }
            return next;
        });
    };

    const isMapped = (header: string) => Object.values(mapping).includes(header);

    const isValid = () => {
        // Check required fields
        const required: (keyof NormalizedTransaction)[] = ['date', 'symbol', 'side', 'quantity', 'price'];
        return required.every(k => mapping[k]);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold">Map Columns</h2>
                    <p className="text-muted-foreground">Match your file's columns to the journal fields.</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={onCancel} className="px-4 py-2 border rounded hover:bg-muted">
                        Cancel
                    </button>
                    <button
                        onClick={() => onConfirm(mapping, sideMap)}
                        disabled={!isValid()}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50"
                    >
                        Preview Import
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                {/* Mapping Form */}
                <div className="space-y-4">
                    {SCHEMA_FIELDS.map(({ key, label, recommended }) => (
                        <div key={key} className="grid grid-cols-[140px_1fr] items-center gap-4">
                            <label className={`text-sm font-medium ${recommended ? 'text-foreground' : 'text-muted-foreground'}`}>
                                {label} {recommended && <span className="text-red-500">*</span>}
                            </label>
                            <select
                                className="p-2 border rounded bg-background"
                                value={mapping[key] || ''}
                                onChange={(e) => handleFieldChange(key, e.target.value)}
                            >
                                <option value="">-- Skip --</option>
                                {headers.map(h => (
                                    <option key={h} value={h}>
                                        {h} {initialMapping[key] === h ? '(Auto)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ))}
                </div>

                {/* Live Preview */}
                <div className="border rounded-lg overflow-hidden bg-muted/10">
                    <div className="bg-muted p-3 text-sm font-medium border-b">
                        Sample Preview (First 5 Rows)
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr>
                                    {SCHEMA_FIELDS.filter(f => mapping[f.key]).map(f => (
                                        <th key={f.key} className="p-2 text-left font-medium whitespace-nowrap">
                                            {f.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {sampleRows.slice(0, 5).map((row, i) => (
                                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                                        {SCHEMA_FIELDS.filter(f => mapping[f.key]).map(f => {
                                            const header = mapping[f.key];
                                            const val = header ? row[header] : '';
                                            return (
                                                <td key={f.key} className="p-2 truncate max-w-[150px]">
                                                    {val}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-3 text-xs text-muted-foreground">
                        * Only mapped columns are shown in preview.
                    </div>
                </div>

            </div>
        </div>
    );
}

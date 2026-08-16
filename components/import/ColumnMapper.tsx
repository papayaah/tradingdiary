'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { NormalizedTransaction, ColumnMapping, SideValueMapping } from '@/lib/import/types';

interface ColumnMapperProps {
    headers: string[];
    sampleRows: Record<string, string>[];
    initialMapping: ColumnMapping;
    initialSideMap: SideValueMapping;
    onConfirm: (mapping: ColumnMapping, sideMap: SideValueMapping) => void;
    onCancel: () => void;
}

const SCHEMA_FIELDS: { key: keyof NormalizedTransaction; label: string; recommended?: boolean; defaultLabel?: string }[] = [
    { key: 'date', label: 'Date', defaultLabel: '(Defaults to Today)' },
    { key: 'symbol', label: 'Symbol / Stock', recommended: true },
    { key: 'side', label: 'Side (Buy/Sell)', defaultLabel: '(Defaults to BUY)' },
    { key: 'quantity', label: 'Quantity', recommended: true },
    { key: 'price', label: 'Price', recommended: true },
    { key: 'time', label: 'Time' },
    { key: 'orderId', label: 'Order ID' },
    { key: 'commission', label: 'Commission' },
    { key: 'currency', label: 'Currency' },
    { key: 'orderType', label: 'Order Type' },
    { key: 'exchanges', label: 'Exchange' },
    { key: 'totalValue', label: 'Total Value' },
    { key: 'realizedPnL', label: 'Realized P&L' },
    { key: 'unrealizedPnL', label: 'Unrealized P&L' },
    { key: 'companyName', label: 'Company / Description' },
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
    const [sideMap] = useState<SideValueMapping>(initialSideMap);

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

    const isValid = () => {
        if (!mapping.symbol) return false;
        if (mapping.realizedPnL) return true;
        return !!(mapping.quantity && mapping.price);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 bg-card-bg p-6 rounded-2xl border border-card-border shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-foreground">Map Columns</h2>
                    <p className="text-sm text-muted">Match your file&apos;s columns to the journal fields.</p>
                </div>
                <div className="flex w-full gap-2 sm:w-auto sm:shrink-0">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-4 py-2 border border-card-border rounded-xl bg-card-bg hover:bg-muted-bg text-foreground transition-all text-sm font-semibold sm:flex-none"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onConfirm(mapping, sideMap)}
                        disabled={!isValid()}
                        className="flex-1 px-6 py-2 bg-accent text-white rounded-xl hover:bg-accent/90 transition-all shadow-sm disabled:opacity-50 font-semibold text-sm sm:flex-none"
                    >
                        Preview Import
                    </button>
                </div>
            </div>

            <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2 xl:gap-8">
                {/* Mapping Form */}
                <div className="min-w-0 space-y-4 bg-card-bg p-6 rounded-2xl border border-card-border shadow-sm">
                    {SCHEMA_FIELDS.map(({ key, label, recommended, defaultLabel }) => (
                        <div key={key} className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-4">
                            <label className={`text-sm font-medium ${recommended ? 'text-foreground font-semibold' : 'text-muted'}`}>
                                {label} {recommended && <span className="text-loss">*</span>}
                                {defaultLabel && !mapping[key] && <div className="text-[10px] text-muted font-normal leading-tight">{defaultLabel}</div>}
                            </label>
                            <div className="relative min-w-0">
                                <select
                                    className="w-full min-w-0 max-w-full appearance-none border border-card-border rounded-xl bg-card-bg py-2.5 pl-2.5 pr-10 text-foreground text-sm outline-none focus:border-accent"
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
                                <ChevronDown
                                    aria-hidden="true"
                                    className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                                />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Live Preview */}
                <div className="min-w-0 self-start border border-card-border rounded-2xl overflow-hidden bg-card-bg shadow-sm">
                    <div className="bg-table-header-bg p-3.5 text-xs uppercase tracking-wider font-semibold text-muted border-b border-card-border">
                        Sample Preview (First 5 Rows)
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-max text-sm">
                            <thead className="bg-table-header-bg text-muted border-b border-card-border text-xs uppercase tracking-wider">
                                <tr>
                                    {SCHEMA_FIELDS.filter(f => mapping[f.key]).map(f => (
                                        <th key={f.key} className="p-2.5 text-left font-semibold whitespace-nowrap">
                                            {f.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-card-border/60">
                                {sampleRows.slice(0, 5).map((row, i) => (
                                    <tr key={i} className="hover:bg-table-row-hover transition-colors">
                                        {SCHEMA_FIELDS.filter(f => mapping[f.key]).map(f => {
                                            const header = mapping[f.key];
                                            const val = header ? row[header] : '';
                                            return (
                                                <td key={f.key} className="p-2.5 truncate max-w-[150px] text-foreground font-mono text-xs">
                                                    {val}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-3 text-xs text-muted">
                        * Only mapped columns are shown in preview.
                    </div>
                </div>
            </div>
        </div>
    );
}

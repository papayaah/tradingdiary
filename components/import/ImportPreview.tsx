'use client';

import { useState, useMemo } from 'react';
import { NormalizedTransaction } from '@/lib/import/types';

interface ImportPreviewProps {
    transactions: NormalizedTransaction[];
    onConfirm: (selected: NormalizedTransaction[]) => void;
    onBack: () => void;
    onEditMapping?: () => void;
    isImporting: boolean;
}

export default function ImportPreview({
    transactions,
    onConfirm,
    onBack,
    onEditMapping,
    isImporting
}: ImportPreviewProps) {
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
        new Set(transactions.map((_, i) => i))
    );

    const selectedTransactions = useMemo(() =>
        transactions.filter((_, i) => selectedIndices.has(i)),
        [transactions, selectedIndices]
    );

    const toggleAll = () => {
        if (selectedIndices.size === transactions.length) {
            setSelectedIndices(new Set());
        } else {
            setSelectedIndices(new Set(transactions.map((_, i) => i)));
        }
    };

    const toggleRow = (index: number) => {
        const next = new Set(selectedIndices);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        setSelectedIndices(next);
    };

    // Calculate summary stats
    const totalSelected = selectedTransactions.length;
    const symbols = Array.from(new Set(selectedTransactions.map(t => t.symbol)));
    const dateRange = selectedTransactions.length > 0
        ? `${selectedTransactions[0].date} — ${selectedTransactions[selectedTransactions.length - 1].date}`
        : 'None';

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-card p-6 rounded-lg border">
                <div>
                    <h2 className="text-2xl font-bold mb-1">Preview Import</h2>
                    <div className="text-sm text-muted-foreground space-x-4">
                        <span>Selected <strong>{totalSelected}</strong> of {transactions.length} trades</span>
                        <span>•</span>
                        <span>{symbols.length} Symbols</span>
                        <span>•</span>
                        <span>{dateRange}</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    {onEditMapping && (
                        <button
                            onClick={onEditMapping}
                            disabled={isImporting}
                            className="px-4 py-2 border rounded hover:bg-muted disabled:opacity-50 text-muted-foreground hover:text-foreground"
                        >
                            Edit Columns
                        </button>
                    )}
                    <button
                        onClick={onBack}
                        disabled={isImporting}
                        className="px-4 py-2 border rounded hover:bg-muted disabled:opacity-50"
                    >
                        Back
                    </button>
                    <button
                        onClick={() => onConfirm(selectedTransactions)}
                        disabled={isImporting || totalSelected === 0}
                        className="px-6 py-2 bg-accent text-white rounded-lg hover:opacity-90 hover:shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 disabled:shadow-none font-semibold flex items-center gap-2"
                    >
                        {isImporting ? (
                            <>
                                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Importing...
                            </>
                        ) : (
                            `Import ${totalSelected} Trades`
                        )}
                    </button>
                </div>
            </div>

            <div className="border rounded-lg overflow-hidden bg-card">
                <div className="overflow-x-auto max-h-[600px]">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted sticky top-0 z-10">
                            <tr>
                                <th className="p-3 font-medium w-10 text-center">
                                    <input
                                        type="checkbox"
                                        checked={selectedIndices.size === transactions.length && transactions.length > 0}
                                        onChange={toggleAll}
                                        className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                                    />
                                </th>
                                <th className="p-3 font-medium">Date</th>
                                <th className="p-3 font-medium">Time</th>
                                <th className="p-3 font-medium">Symbol</th>
                                <th className="p-3 font-medium">Side</th>
                                <th className="p-3 font-medium text-right">Qty</th>
                                <th className="p-3 font-medium text-right">Price</th>
                                <th className="p-3 font-medium text-right">Total</th>
                                <th className="p-3 font-medium text-right">Profit</th>
                                <th className="p-3 font-medium">Account</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {transactions.map((t, i) => (
                                <tr key={i} className={`hover:bg-muted/50 transition-opacity ${!selectedIndices.has(i) ? 'bg-muted/30 opacity-60' : ''}`}>
                                    <td className="p-3 text-center">
                                        <input
                                            type="checkbox"
                                            checked={selectedIndices.has(i)}
                                            onChange={() => toggleRow(i)}
                                            className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                                        />
                                    </td>
                                    <td className="p-3 whitespace-nowrap">{t.date}</td>
                                    <td className="p-3 whitespace-nowrap text-muted-foreground">{t.time}</td>
                                    <td className="p-3 font-medium">{t.symbol}</td>
                                    <td className={`p-3 font-medium ${t.side === 'BUY' ? 'text-green-600' : 'text-red-600'
                                        }`}>
                                        {t.side}
                                    </td>
                                    <td className="p-3 text-right">{t.quantity !== 0 ? t.quantity.toLocaleString() : <span className="text-muted-foreground">-</span>}</td>
                                    <td className="p-3 text-right">{t.price !== 0 ? t.price.toFixed(3) : <span className="text-muted-foreground">-</span>}</td>
                                    <td className="p-3 text-right font-medium">
                                        {(t.totalValue || (t.quantity * t.price)) !== 0
                                            ? (t.totalValue || (t.quantity * t.price)).toLocaleString(undefined, { maximumFractionDigits: 2 })
                                            : <span className="text-muted-foreground">-</span>
                                        }
                                    </td>
                                    <td className={`p-3 text-right font-medium ${t.realizedPnL && t.realizedPnL > 0 ? 'text-green-600' : t.realizedPnL && t.realizedPnL < 0 ? 'text-red-600' : ''}`}>
                                        {t.realizedPnL ? (
                                            <span className="flex items-center justify-end">
                                                {t.realizedPnL < 0 ? '-' : ''}${Math.abs(t.realizedPnL).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                            </span>
                                        ) : (
                                            <span className="text-muted-foreground">-</span>
                                        )}
                                    </td>
                                    <td className="p-3 text-muted-foreground overflow-hidden text-ellipsis max-w-[100px]">
                                        Main
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

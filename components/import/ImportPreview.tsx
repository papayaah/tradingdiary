'use client';

import { NormalizedTransaction } from '@/lib/import/types';

interface ImportPreviewProps {
    transactions: NormalizedTransaction[];
    onConfirm: () => void;
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

    // Calculate summary stats
    const totalTrades = transactions.length;
    const symbols = Array.from(new Set(transactions.map(t => t.symbol)));
    const dateRange = transactions.length > 0
        ? `${transactions[0].date} — ${transactions[transactions.length - 1].date}`
        : 'None';

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-card p-6 rounded-lg border">
                <div>
                    <h2 className="text-2xl font-bold mb-1">Preview Import</h2>
                    <div className="text-sm text-muted-foreground space-x-4">
                        <span>Found <strong>{totalTrades}</strong> trades</span>
                        <span>•</span>
                        <span>{symbols.length} Symbols ({symbols.slice(0, 3).join(', ')}{symbols.length > 3 ? '...' : ''})</span>
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
                        onClick={onConfirm}
                        disabled={isImporting || totalTrades === 0}
                        className="px-6 py-2 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 font-medium flex items-center gap-2"
                    >
                        {isImporting ? 'Importing...' : `Import ${totalTrades} Trades`}
                    </button>
                </div>
            </div>

            <div className="border rounded-lg overflow-hidden bg-card">
                <div className="overflow-x-auto max-h-[600px]">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted sticky top-0 z-10">
                            <tr>
                                <th className="p-3 font-medium">Date</th>
                                <th className="p-3 font-medium">Time</th>
                                <th className="p-3 font-medium">Symbol</th>
                                <th className="p-3 font-medium">Side</th>
                                <th className="p-3 font-medium text-right">Qty</th>
                                <th className="p-3 font-medium text-right">Price</th>
                                <th className="p-3 font-medium text-right">Total</th>
                                <th className="p-3 font-medium">Account</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {transactions.map((t, i) => (
                                <tr key={i} className="hover:bg-muted/50">
                                    <td className="p-3 whitespace-nowrap">{t.date}</td>
                                    <td className="p-3 whitespace-nowrap text-muted-foreground">{t.time}</td>
                                    <td className="p-3 font-medium">{t.symbol}</td>
                                    <td className={`p-3 font-medium ${t.side === 'BUY' ? 'text-green-600' : 'text-red-600'
                                        }`}>
                                        {t.side}
                                    </td>
                                    <td className="p-3 text-right">{t.quantity.toLocaleString()}</td>
                                    <td className="p-3 text-right">{t.price.toFixed(3)}</td>
                                    <td className="p-3 text-right font-medium">
                                        {(t.totalValue || (t.quantity * t.price)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="p-3 text-muted-foreground overflow-hidden text-ellipsis max-w-[100px]">
                                        {/* Placeholder for now */}
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

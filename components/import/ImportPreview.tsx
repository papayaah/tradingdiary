import { useState, useMemo, useEffect } from 'react';
import { NormalizedTransaction } from '@/lib/import/types';
import { AccountRecord } from '@/lib/db/schema';
import { CreditCard, Plus, Wallet } from 'lucide-react';

interface ImportPreviewProps {
    transactions: NormalizedTransaction[];
    accounts: AccountRecord[];
    suggestedCurrency?: string;
    onConfirm: (selected: NormalizedTransaction[], accountData: { id?: string; name?: string; currency?: string; type?: string }) => void;
    onBack: () => void;
    onEditMapping?: () => void;
    isImporting: boolean;
}

export default function ImportPreview({
    transactions,
    accounts,
    suggestedCurrency = 'USD',
    onConfirm,
    onBack,
    onEditMapping,
    isImporting
}: ImportPreviewProps) {
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
        new Set(transactions.map((_, i) => i))
    );

    // Account state
    const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts.length > 0 ? accounts[0].accountId : 'new');
    const [newAccountName, setNewAccountName] = useState('');
    const [newAccountCurrency, setNewAccountCurrency] = useState(suggestedCurrency);
    const [newAccountType, setNewAccountType] = useState('Custom');

    useEffect(() => {
        if (suggestedCurrency) {
            setNewAccountCurrency(suggestedCurrency);
        }
    }, [suggestedCurrency]);

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

    const handleConfirm = () => {
        if (selectedAccountId === 'new') {
            onConfirm(selectedTransactions, {
                name: newAccountName || `New Account ${new Date().toLocaleDateString()}`,
                currency: newAccountCurrency,
                type: newAccountType
            });
        } else {
            onConfirm(selectedTransactions, { id: selectedAccountId });
        }
    };

    // Calculate summary stats
    const totalSelected = selectedTransactions.length;
    const symbols = Array.from(new Set(selectedTransactions.map(t => t.symbol)));
    const dateRange = selectedTransactions.length > 0
        ? `${selectedTransactions[0].date} — ${selectedTransactions[selectedTransactions.length - 1].date}`
        : 'None';

    const selectedAccount = accounts.find(a => a.accountId === selectedAccountId);

    return (
        <div className="space-y-6">
            <div className="bg-card p-6 rounded-lg border shadow-sm space-y-6">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold mb-1">Finalize Import</h2>
                        <div className="text-sm text-muted-foreground space-x-3 flex items-center">
                            <span className="bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium">Selected {totalSelected} Trades</span>
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
                                className="px-4 py-2 border rounded-lg hover:bg-muted disabled:opacity-50 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                Edit Columns
                            </button>
                        )}
                        <button
                            onClick={onBack}
                            disabled={isImporting}
                            className="px-4 py-2 border rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
                        >
                            Back
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={isImporting || totalSelected === 0 || (selectedAccountId === 'new' && !newAccountName && accounts.length > 0)}
                            className="px-6 py-2 bg-accent text-white rounded-lg hover:opacity-90 hover:shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 disabled:shadow-none font-semibold flex items-center gap-2"
                        >
                            {isImporting ? (
                                <>
                                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                                    Importing...
                                </>
                            ) : (
                                `Import ${totalSelected} Trades`
                            )}
                        </button>
                    </div>
                </div>

                <div className="pt-4 border-t grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                        <label className="text-sm font-semibold flex items-center gap-2">
                            <Wallet size={16} className="text-accent" />
                            Target Account
                        </label>
                        <div className="grid grid-cols-1 gap-2">
                            {accounts.map(acc => (
                                <button
                                    key={acc.accountId}
                                    onClick={() => setSelectedAccountId(acc.accountId)}
                                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${selectedAccountId === acc.accountId ? 'border-accent bg-accent/5 ring-1 ring-accent' : 'hover:border-accent/40 bg-muted/20'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${selectedAccountId === acc.accountId ? 'bg-accent text-white' : 'bg-muted text-muted-foreground'}`}>
                                            <CreditCard size={18} />
                                        </div>
                                        <div>
                                            <div className="font-medium">{acc.name}</div>
                                            <div className="text-xs text-muted-foreground">{acc.type} • {acc.currency}</div>
                                        </div>
                                    </div>
                                    {selectedAccountId === acc.accountId && <div className="w-2 h-2 rounded-full bg-accent" />}
                                </button>
                            ))}
                            <button
                                onClick={() => setSelectedAccountId('new')}
                                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selectedAccountId === 'new' ? 'border-accent bg-accent/5 ring-1 ring-accent' : 'hover:border-accent/40 bg-muted/20'}`}
                            >
                                <div className={`p-2 rounded-lg ${selectedAccountId === 'new' ? 'bg-accent text-white' : 'bg-muted text-muted-foreground'}`}>
                                    <Plus size={18} />
                                </div>
                                <div className="font-medium">Create New Account</div>
                            </button>
                        </div>
                    </div>

                    {selectedAccountId === 'new' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                            <label className="text-sm font-semibold flex items-center gap-2">
                                New Account Details
                            </label>
                            <div className="space-y-3 bg-muted/30 p-4 rounded-xl border">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Account Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Schwab Main, IBKR HK"
                                        value={newAccountName}
                                        onChange={e => setNewAccountName(e.target.value)}
                                        className="w-full p-2 bg-background border rounded-lg focus:ring-1 ring-accent outline-none text-sm"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Broker / Type</label>
                                        <select
                                            value={newAccountType}
                                            onChange={e => setNewAccountType(e.target.value)}
                                            className="w-full p-2 bg-background border rounded-lg focus:ring-1 ring-accent outline-none text-sm"
                                        >
                                            <option>Charles Schwab</option>
                                            <option>IBKR</option>
                                            <option>E*TRADE</option>
                                            <option>Fidelity</option>
                                            <option>Robinhood</option>
                                            <option>Webull</option>
                                            <option>MetaTrader</option>
                                            <option>Custom</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Base Currency</label>
                                        <select
                                            value={newAccountCurrency}
                                            onChange={e => setNewAccountCurrency(e.target.value)}
                                            className="w-full p-2 bg-background border rounded-lg focus:ring-1 ring-accent outline-none text-sm font-medium"
                                        >
                                            <option value="USD">USD ($)</option>
                                            <option value="HKD">HKD (HK$)</option>
                                            <option value="EUR">EUR (€)</option>
                                            <option value="GBP">GBP (£)</option>
                                            <option value="CAD">CAD (C$)</option>
                                            <option value="AUD">AUD (A$)</option>
                                            <option value="SGD">SGD (S$)</option>
                                            <option value="JPY">JPY (¥)</option>
                                            <option value="INR">INR (₹)</option>
                                        </select>
                                    </div>
                                </div>
                                {suggestedCurrency && suggestedCurrency !== newAccountCurrency && (
                                    <p className="text-[10px] text-accent font-medium mt-1">
                                        💡 Suggested {suggestedCurrency} based on your data.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {selectedAccountId !== 'new' && selectedAccount && (
                        <div className="flex items-center justify-center bg-muted/20 border border-dashed rounded-xl p-8 text-center">
                            <div className="space-y-2">
                                <Wallet size={32} className="mx-auto text-muted-foreground opacity-50" />
                                <p className="text-sm text-muted-foreground max-w-xs">
                                    Importing trades into your existing <strong>{selectedAccount.name}</strong> account ({selectedAccount.currency}).
                                </p>
                            </div>
                        </div>
                    )}
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

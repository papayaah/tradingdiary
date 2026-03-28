import { useState, useMemo, useEffect } from 'react';
import { NormalizedTransaction } from '@/lib/import/types';
import { AccountRecord } from '@/lib/db/schema';
import { CreditCard, Plus, Wallet, TrendingUp, TrendingDown, Activity, BarChart3, Info, Calendar } from 'lucide-react';
import { toTransactionRecords } from '@/lib/import/converter';
import { aggregateByDay } from '@/lib/trading/aggregator';
import { formatCurrency } from '@/lib/currency';
import ReplayTimeline from '@/components/replay/ReplayTimeline';
import { computePnLTimeline, timeToSeconds } from '@/lib/replay/engine';

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
    const symbols = Array.from(new Set(selectedTransactions.map((t: NormalizedTransaction) => t.symbol)));
    const dateRange = selectedTransactions.length > 0
        ? `${selectedTransactions[0].date} — ${selectedTransactions[selectedTransactions.length - 1].date}`
        : 'None';

    const selectedAccount = accounts.find(a => a.accountId === selectedAccountId);

    // Group selected transactions into a daily summary for "Insights"
    const insights = useMemo(() => {
        if (selectedTransactions.length === 0) return null;
        try {
            const records = toTransactionRecords(selectedTransactions, 'preview', selectedAccount?.currency || 'USD');
            const summaries = aggregateByDay(records, null);
            if (summaries.length === 0) return null;

            // If multi-day, aggregate the summaries
            const totalPnL = summaries.reduce((s, d) => s + d.totalPnL, 0);
            const totalVolume = summaries.reduce((s, d) => s + d.totalVolume, 0);
            const totalCommissions = summaries.reduce((s, d) => s + d.totalCommissions, 0);
            const winCount = summaries.reduce((s, d) => s + d.winCount, 0);
            const lossCount = summaries.reduce((s, d) => s + d.lossCount, 0);
            const totalTrades = winCount + lossCount;
            const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;

            return {
                totalPnL,
                totalVolume,
                totalCommissions,
                winRate,
                totalTrades,
                summaries
            };
        } catch (e) {
            console.error("Failed to compute preview insights", e);
            return null;
        }
    }, [selectedTransactions, selectedAccount]);

    // Compute Timeline Data for the visual playback
    const timelineData = useMemo(() => {
        if (!insights || selectedTransactions.length === 0) return null;
        try {
            const txns = toTransactionRecords(selectedTransactions, 'preview', selectedAccount?.currency || 'USD');
            const sorted = [...txns].sort((a, b) => timeToSeconds(a.time) - timeToSeconds(b.time));

            if (sorted.length === 0) return null;

            const times = sorted.map(t => timeToSeconds(t.time));
            const min = Math.min(...times);
            const max = Math.max(...times);

            const seen = new Set<string>();
            const symbols: string[] = [];
            for (const t of sorted) {
                if (!seen.has(t.symbol)) {
                    seen.add(t.symbol);
                    symbols.push(t.symbol);
                }
            }

            return {
                transactions: sorted,
                symbols,
                startTime: Math.max(0, min - 900), // 15m buffer
                endTime: Math.min(86400, max + 900),  // 15m buffer
                snapshots: computePnLTimeline(sorted)
            };
        } catch (e) {
            console.error("Timeline computation failed", e);
            return null;
        }
    }, [insights, selectedTransactions, selectedAccount]);

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

                {insights && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-xl border border-dashed animate-in fade-in duration-500">
                        <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                                <Activity size={12} className="text-accent" />
                                Est. Net P&L
                            </span>
                            <div className={`text-xl font-black ${insights.totalPnL >= 0 ? 'text-profit' : 'text-loss'}`}>
                                {formatCurrency(insights.totalPnL, selectedAccount?.currency || 'USD')}
                            </div>
                        </div>
                        <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                                <BarChart3 size={12} className="text-accent" />
                                Win Rate
                            </span>
                            <div className="text-xl font-black text-foreground">
                                {insights.winRate.toFixed(1)}%
                                <span className="text-[10px] text-muted-foreground ml-2 font-medium">({insights.totalTrades} trades)</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                                <TrendingUp size={12} className="text-accent" />
                                Total Volume
                            </span>
                            <div className="text-xl font-black text-foreground">
                                {insights.totalVolume.toLocaleString()}
                                <span className="text-[10px] text-muted-foreground ml-2 font-medium">shares</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
                                <TrendingDown size={12} className="text-accent" />
                                Commissions
                            </span>
                            <div className="text-xl font-black text-muted-foreground">
                                {formatCurrency(insights.totalCommissions, selectedAccount?.currency || 'USD')}
                            </div>
                        </div>
                        <div className="col-span-full pt-2 flex items-start gap-2 text-[10px] text-muted-foreground italic">
                            <Info size={12} className="mt-0.5 shrink-0" />
                            <span>These calculations use your current position tracking logic to estimate performance. Results may vary once imported into the full account history.</span>
                        </div>
                    </div>
                )}

                {timelineData && (
                    <div className="bg-card-bg/30 border border-card-border p-5 rounded-2xl shadow-inner mt-4 overflow-hidden animate-in zoom-in-95 duration-700">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center gap-2">
                                <Activity size={12} className="text-accent" />
                                Session Activity Preview
                            </h3>
                            <div className="text-[10px] font-bold text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                                {timelineData.symbols.length} Tickers Active
                            </div>
                        </div>
                        <ReplayTimeline
                            transactions={timelineData.transactions}
                            symbols={timelineData.symbols}
                            currentTimeSeconds={timelineData.endTime}
                            startTimeSeconds={timelineData.startTime}
                            endTimeSeconds={timelineData.endTime}
                            snapshots={timelineData.snapshots}
                            prevVisibleCount={timelineData.transactions.length}
                        />
                    </div>
                )}

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

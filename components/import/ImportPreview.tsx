'use client';

import { useState, useMemo, useEffect } from 'react';
import { NormalizedTransaction } from '@/lib/import/types';
import { AccountRecord } from '@/lib/db/schema';
import { CreditCard, Plus, Wallet, TrendingUp, TrendingDown, Activity, BarChart3, Info, Lightbulb, ScanSearch } from 'lucide-react';
import { toTransactionRecords } from '@/lib/import/converter';
import { aggregateByDay } from '@/lib/trading/aggregator';
import { formatCurrency } from '@/lib/currency';
import { getImportAccountDefaults, getRecommendedImportAccountId } from '@/lib/import/account-defaults';

interface ImportPreviewProps {
    transactions: NormalizedTransaction[];
    accounts: AccountRecord[];
    suggestedCurrency?: string;
    detectedBrokerName?: string | null;
    onConfirm: (selected: NormalizedTransaction[], accountData: { id?: string; name?: string; currency?: string; type?: string }) => void;
    onBack: () => void;
    onEditMapping?: () => void;
    isImporting: boolean;
}

export default function ImportPreview({
    transactions,
    accounts,
    suggestedCurrency = 'USD',
    detectedBrokerName,
    onConfirm,
    onBack,
    onEditMapping,
    isImporting
}: ImportPreviewProps) {
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
        new Set(transactions.map((_, i) => i))
    );

    const recommendedAccountId = useMemo(
        () => getRecommendedImportAccountId(accounts, detectedBrokerName, suggestedCurrency),
        [accounts, detectedBrokerName, suggestedCurrency]
    );
    const [accountSelection, setAccountSelection] = useState<string | null>(null);
    const selectedAccountId = accountSelection ?? recommendedAccountId;

    // New account form state
    const accountDefaults = getImportAccountDefaults(detectedBrokerName);
    const newAccountType = accountDefaults.type;
    const [newAccountName, setNewAccountName] = useState(accountDefaults.name);
    const [newAccountCurrency, setNewAccountCurrency] = useState(suggestedCurrency);

    useEffect(() => {
        if (suggestedCurrency) {
            setNewAccountCurrency(suggestedCurrency);
        }
    }, [suggestedCurrency]);

    const toggleAll = () => {
        if (selectedIndices.size === transactions.length) {
            setSelectedIndices(new Set());
        } else {
            setSelectedIndices(new Set(transactions.map((_, i) => i)));
        }
    };

    const toggleRow = (index: number) => {
        const next = new Set(selectedIndices);
        if (next.has(index)) {
            next.delete(index);
        } else {
            next.add(index);
        }
        setSelectedIndices(next);
    };

    const selectedTransactions = useMemo(() => {
        return transactions.filter((_, i) => selectedIndices.has(i));
    }, [transactions, selectedIndices]);

    // Calculate preview insights (PnL, Volume, Win Rate)
    const insights = useMemo(() => {
        if (selectedTransactions.length === 0) return null;

        let totalPnL = 0;
        let totalVolume = 0;
        let wins = 0;
        let losses = 0;
        let totalCommissions = 0;

        selectedTransactions.forEach(t => {
            totalVolume += Math.abs(t.quantity);
            if (t.commission) totalCommissions += Math.abs(t.commission);

            // If transaction already has explicit PnL
            if (t.realizedPnL !== undefined && t.realizedPnL !== 0) {
                totalPnL += t.realizedPnL;
                if (t.realizedPnL > 0) wins++;
                else if (t.realizedPnL < 0) losses++;
            }
        });

        // If no explicit PnL found, attempt basic position aggregation PnL estimation
        if (totalPnL === 0 && wins === 0 && losses === 0) {
            const tempRecords = toTransactionRecords(selectedTransactions, 'preview-acc', 'USD');
            const daily = aggregateByDay(tempRecords);
            daily.forEach(d => {
                totalPnL += d.totalPnL;
                wins += d.winCount;
                losses += d.lossCount;
            });
        }

        const closedTrades = wins + losses;
        const winRate = closedTrades > 0 ? (wins / closedTrades) * 100 : 0;

        return {
            totalPnL,
            totalVolume,
            winRate,
            totalTrades: selectedTransactions.length,
            totalCommissions
        };
    }, [selectedTransactions]);

    const selectedAccount = useMemo(() => {
        return accounts.find(a => a.accountId === selectedAccountId);
    }, [accounts, selectedAccountId]);

    const handleConfirm = () => {
        if (selectedAccountId === 'new') {
            onConfirm(selectedTransactions, {
                name: newAccountName || 'New Account',
                currency: newAccountCurrency,
                type: newAccountType
            });
        } else if (selectedAccount) {
            onConfirm(selectedTransactions, {
                id: selectedAccount.accountId,
                name: selectedAccount.name,
                currency: selectedAccount.currency,
                type: selectedAccount.type
            });
        }
    };

    const dateRange = useMemo(() => {
        if (!selectedTransactions.length) return '';
        const dates = selectedTransactions.map(t => t.date).sort();
        const min = dates[0];
        const max = dates[dates.length - 1];
        return min === max ? min : `${min} to ${max}`;
    }, [selectedTransactions]);

    const totalSelected = selectedTransactions.length;
    const symbols = Array.from(new Set(selectedTransactions.map((t: NormalizedTransaction) => t.symbol)));

    return (
        <div className="space-y-6">
            <div className="bg-card-bg p-6 rounded-2xl border border-card-border shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-foreground mb-1">Finalize Import</h2>
                        <div className="text-sm text-muted space-x-3 flex items-center flex-wrap">
                            <span className="bg-accent/10 text-accent px-2.5 py-0.5 rounded-full text-xs font-semibold">Selected {totalSelected} Trades</span>
                            <span>•</span>
                            <span>{symbols.length || 0} Symbols</span>
                            <span>•</span>
                            <span>{dateRange}</span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {onEditMapping && (
                            <button
                                onClick={onEditMapping}
                                disabled={isImporting}
                                className="px-4 py-2 border border-card-border rounded-xl bg-card-bg hover:bg-muted/50 text-muted hover:text-foreground transition-all disabled:opacity-50 text-sm font-semibold"
                            >
                                Edit Columns
                            </button>
                        )}
                        <button
                            onClick={onBack}
                            disabled={isImporting}
                            className="px-4 py-2 border border-card-border rounded-xl bg-card-bg hover:bg-muted/50 text-foreground transition-all disabled:opacity-50 text-sm font-semibold"
                        >
                            Back
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={isImporting || totalSelected === 0 || (selectedAccountId === 'new' && !newAccountName && accounts.length > 0)}
                            className="px-6 py-2 bg-accent text-white rounded-xl hover:bg-accent/90 transition-all shadow-sm disabled:opacity-50 font-semibold text-sm flex items-center gap-2"
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

                {/* Target Account Selection (Prominently placed at the top) */}
                <div className="pt-6 border-t border-card-border grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                        <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Wallet size={16} className="text-accent" />
                            Target Account
                        </label>
                        <div className="grid grid-cols-1 gap-2">
                            {accounts.map(acc => (
                                <button
                                    key={acc.accountId}
                                    onClick={() => setAccountSelection(acc.accountId)}
                                    className={`flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${selectedAccountId === acc.accountId ? 'border-accent bg-accent/10 ring-1 ring-accent' : 'hover:border-card-border/80 border-card-border bg-card-bg/60'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2.5 rounded-xl ${selectedAccountId === acc.accountId ? 'bg-accent text-white' : 'bg-muted-bg text-muted border border-card-border'}`}>
                                            <CreditCard size={18} />
                                        </div>
                                        <div>
                                            <div className="font-semibold text-foreground">{acc.name}</div>
                                            <div className="text-xs text-muted font-medium">{acc.type} • {acc.currency}</div>
                                        </div>
                                    </div>
                                    {selectedAccountId === acc.accountId && <div className="w-2.5 h-2.5 rounded-full bg-accent" />}
                                </button>
                            ))}
                            <button
                                onClick={() => setAccountSelection('new')}
                                className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${selectedAccountId === 'new' ? 'border-accent bg-accent/10 ring-1 ring-accent' : 'hover:border-card-border/80 border-card-border bg-card-bg/60'}`}
                            >
                                <div className={`p-2.5 rounded-xl ${selectedAccountId === 'new' ? 'bg-accent text-white' : 'bg-muted-bg text-muted border border-card-border'}`}>
                                    <Plus size={18} />
                                </div>
                                <div className="font-semibold text-foreground">Create New Account</div>
                            </button>
                        </div>
                    </div>

                    {selectedAccountId === 'new' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                            <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                                New Account Details
                            </label>
                            <div className="space-y-4 bg-card-bg p-4 rounded-xl border border-card-border">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-muted mb-1 block">Account Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Schwab Main, IBKR HK"
                                        value={newAccountName}
                                        onChange={e => setNewAccountName(e.target.value)}
                                        className="w-full p-2.5 bg-card-bg border border-card-border rounded-xl focus:border-accent outline-none text-sm text-foreground placeholder:text-muted"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-muted mb-1 block">Broker / Type</label>
                                        <div className="flex min-h-[42px] items-center gap-2.5 rounded-xl border border-card-border bg-muted-bg/50 px-3 py-2">
                                            <ScanSearch size={16} className="shrink-0 text-accent" />
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-semibold text-foreground">{newAccountType}</div>
                                                <div className="truncate text-[10px] text-muted">
                                                    {accountDefaults.wasBrokerDetected ? 'Auto-detected from your file' : 'Generic format detected automatically'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-muted mb-1 block">Base Currency</label>
                                        <select
                                            value={newAccountCurrency}
                                            onChange={e => setNewAccountCurrency(e.target.value)}
                                            className="w-full p-2.5 bg-card-bg border border-card-border rounded-xl focus:border-accent outline-none text-sm font-medium text-foreground"
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
                                    <p className="text-[10px] text-accent font-medium mt-1 flex items-center gap-1">
                                        <Lightbulb className="w-3 h-3 text-accent shrink-0" />
                                        <span>Suggested {suggestedCurrency} based on your data.</span>
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {selectedAccountId !== 'new' && selectedAccount && (
                        <div className="flex items-center justify-center bg-card-bg/40 border border-dashed border-card-border rounded-xl p-8 text-center">
                            <div className="space-y-2">
                                <Wallet size={32} className="mx-auto text-muted opacity-50" />
                                <p className="text-sm text-muted max-w-xs leading-relaxed">
                                    Importing trades into your existing <strong className="text-foreground">{selectedAccount.name}</strong> account ({selectedAccount.currency}).
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {insights && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-card-bg/50 rounded-2xl border border-card-border border-dashed animate-in fade-in duration-500">
                        <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-muted flex items-center gap-1.5">
                                <Activity size={12} className="text-accent" />
                                Est. Net P&L
                            </span>
                            <div className={`text-xl font-black ${insights.totalPnL >= 0 ? 'text-profit' : 'text-loss'}`}>
                                {formatCurrency(insights.totalPnL, selectedAccount?.currency || 'USD')}
                            </div>
                        </div>
                        <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-muted flex items-center gap-1.5">
                                <BarChart3 size={12} className="text-accent" />
                                Win Rate
                            </span>
                            <div className="text-xl font-black text-foreground">
                                {insights.winRate.toFixed(1)}%
                                <span className="text-[10px] text-muted ml-2 font-medium">({insights.totalTrades} trades)</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-muted flex items-center gap-1.5">
                                <TrendingUp size={12} className="text-accent" />
                                Total Volume
                            </span>
                            <div className="text-xl font-black text-foreground">
                                {insights.totalVolume.toLocaleString()}
                                <span className="text-[10px] text-muted ml-2 font-medium">shares</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-muted flex items-center gap-1.5">
                                <TrendingDown size={12} className="text-accent" />
                                Commissions
                            </span>
                            <div className="text-xl font-black text-muted">
                                {formatCurrency(insights.totalCommissions, selectedAccount?.currency || 'USD')}
                            </div>
                        </div>
                        <div className="col-span-full pt-2 flex items-start gap-2 text-[10px] text-muted italic">
                            <Info size={12} className="mt-0.5 shrink-0" />
                            <span>These calculations use your current position tracking logic to estimate performance. Results may vary once imported into the full account history.</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="border border-card-border rounded-2xl overflow-hidden bg-card-bg shadow-sm">
                <div className="overflow-x-auto max-h-[600px]">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-table-header-bg text-muted border-b border-card-border text-xs uppercase tracking-wider font-semibold sticky top-0 z-10">
                            <tr>
                                <th className="p-3.5 font-semibold w-10 text-center">
                                    <input
                                        type="checkbox"
                                        checked={selectedIndices.size === transactions.length && transactions.length > 0}
                                        onChange={toggleAll}
                                        className="rounded border-card-border text-accent focus:ring-accent w-4 h-4 cursor-pointer"
                                    />
                                </th>
                                <th className="p-3.5 font-semibold">Date</th>
                                <th className="p-3.5 font-semibold">Time</th>
                                <th className="p-3.5 font-semibold">Symbol</th>
                                <th className="p-3.5 font-semibold">Side</th>
                                <th className="p-3.5 font-semibold text-right">Qty</th>
                                <th className="p-3.5 font-semibold text-right">Price</th>
                                <th className="p-3.5 font-semibold text-right">Total</th>
                                <th className="p-3.5 font-semibold text-right">Profit</th>
                                <th className="p-3.5 font-semibold">Account</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-card-border/60">
                            {transactions.map((t, i) => (
                                <tr key={i} className={`hover:bg-muted/30 transition-colors ${!selectedIndices.has(i) ? 'bg-muted/10 opacity-40' : ''}`}>
                                    <td className="p-3.5 text-center">
                                        <input
                                            type="checkbox"
                                            checked={selectedIndices.has(i)}
                                            onChange={() => toggleRow(i)}
                                            className="rounded border-card-border text-accent focus:ring-accent w-4 h-4 cursor-pointer"
                                        />
                                    </td>
                                    <td className="p-3.5 whitespace-nowrap text-foreground font-mono text-xs">{t.date}</td>
                                    <td className="p-3.5 whitespace-nowrap text-muted font-mono text-xs">{t.time}</td>
                                    <td className="p-3.5 font-bold text-foreground">{t.symbol}</td>
                                    <td className={`p-3.5 font-bold text-xs ${t.side === 'BUY' ? 'text-profit' : 'text-loss'
                                        }`}>
                                        {t.side}
                                    </td>
                                    <td className="p-3.5 text-right font-mono text-xs text-foreground">{t.quantity !== 0 ? t.quantity.toLocaleString() : <span className="text-muted">-</span>}</td>
                                    <td className="p-3.5 text-right font-mono text-xs text-foreground">{t.price !== 0 ? t.price.toFixed(3) : <span className="text-muted">-</span>}</td>
                                    <td className="p-3.5 text-right font-mono text-xs font-semibold text-foreground">
                                        {(t.totalValue || (t.quantity * t.price)) !== 0
                                            ? (t.totalValue || (t.quantity * t.price)).toLocaleString(undefined, { maximumFractionDigits: 2 })
                                            : <span className="text-muted">-</span>
                                        }
                                    </td>
                                    <td className={`p-3.5 text-right font-mono text-xs font-semibold ${t.realizedPnL && t.realizedPnL > 0 ? 'text-profit' : t.realizedPnL && t.realizedPnL < 0 ? 'text-loss' : ''}`}>
                                        {t.realizedPnL ? (
                                            <span className="flex items-center justify-end">
                                                {t.realizedPnL < 0 ? '-' : ''}${Math.abs(t.realizedPnL).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                            </span>
                                        ) : (
                                            <span className="text-muted">-</span>
                                        )}
                                    </td>
                                    <td className="p-3.5 text-muted text-xs overflow-hidden text-ellipsis max-w-[100px]">
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

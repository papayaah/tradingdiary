'use client';

import { useState, useEffect } from 'react';
import { useAccount } from '@/contexts/AccountContext';
import { updateAccount } from '@/lib/db/trades';
import { Wallet, Save, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AccountSettings() {
    const { accounts, selectedAccountId, refreshAccounts } = useAccount();
    const activeAccount = accounts.find(a => a.accountId === selectedAccountId);

    const [initialBalance, setInitialBalance] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (activeAccount) {
            setInitialBalance(activeAccount.initialBalance?.toString() || '');
        }
    }, [activeAccount]);

    if (!activeAccount) {
        return (
            <div className="bg-card-bg/50 backdrop-blur-sm border border-card-border p-6 rounded-2xl shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                        <Wallet size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-foreground">Account Parameters</h2>
                        <p className="text-xs text-muted font-medium">No account selected</p>
                    </div>
                </div>
                <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/10 text-xs text-orange-500/80 font-medium">
                    Please import your trading data first. Account-specific settings like starting balance will appear here once an account is created.
                </div>
            </div>
        );
    }

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const balance = parseFloat(initialBalance);
            if (isNaN(balance) && initialBalance !== '') {
                toast.error('Please enter a valid number for the initial balance');
                return;
            }

            await updateAccount({
                ...activeAccount,
                initialBalance: initialBalance === '' ? undefined : balance
            });

            await refreshAccounts(activeAccount.accountId);
            toast.success('Account settings saved');
        } catch (error) {
            console.error('Failed to save account settings', error);
            toast.error('Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-card-bg/50 backdrop-blur-sm border border-card-border p-6 rounded-2xl shadow-sm">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                    <Wallet size={20} />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-foreground">Account Parameters</h2>
                    <p className="text-xs text-muted font-medium">Configure specific settings for <b>{activeAccount.name}</b></p>
                </div>
            </div>

            <div className="space-y-4 max-w-sm">
                <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">
                        Starting Balance ({activeAccount.currency})
                    </label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted font-bold">$</span>
                        <input
                            type="number"
                            value={initialBalance}
                            onChange={(e) => setInitialBalance(e.target.value)}
                            placeholder="e.g. 50000"
                            className="w-full bg-background/50 border border-card-border rounded-xl py-3 pl-8 pr-4 text-sm font-bold outline-none focus:border-accent transition-all"
                        />
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground font-medium leading-relaxed">
                        Required to calculate cumulative percentage returns on the dashboard.
                        Usually your portfolio balance before the first imported trade.
                    </p>
                </div>

                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-accent text-white rounded-xl text-xs font-bold shadow-lg shadow-accent/20 hover:bg-accent/90 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                    {isSaving ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <>
                            <Save size={14} />
                            Save Configuration
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

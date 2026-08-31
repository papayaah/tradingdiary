'use client';

import { useState, useEffect, useRef } from 'react';
import { useAccount } from '@/contexts/AccountContext';
import { updateAccount } from '@/lib/db/trades';
import { Wallet, Save, ChevronDown, Check } from 'lucide-react';
import { toast } from 'sonner';

const CURRENCY_OPTIONS = [
  { code: 'USD', symbol: '$', label: 'USD ($) — US Dollar' },
  { code: 'HKD', symbol: 'HK$', label: 'HKD (HK$) — Hong Kong Dollar' },
  { code: 'EUR', symbol: '€', label: 'EUR (€) — Euro' },
  { code: 'GBP', symbol: '£', label: 'GBP (£) — British Pound' },
  { code: 'JPY', symbol: '¥', label: 'JPY (¥) — Japanese Yen' },
  { code: 'CAD', symbol: 'C$', label: 'CAD (C$) — Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', label: 'AUD (A$) — Australian Dollar' },
  { code: 'SGD', symbol: 'S$', label: 'SGD (S$) — Singapore Dollar' },
  { code: 'CNY', symbol: '¥', label: 'CNY (¥) — Chinese Yuan' },
];

function CustomCurrencySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activeOption = CURRENCY_OPTIONS.find((c) => c.code === value) || CURRENCY_OPTIONS[0];

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between bg-background/50 border border-card-border rounded-xl py-3 px-4 text-sm font-normal text-foreground hover:border-accent focus:border-accent transition-all cursor-pointer shadow-sm"
      >
        <span className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wider bg-accent/10 text-accent rounded border border-accent/20">
            {activeOption.symbol}
          </span>
          <span>{activeOption.label}</span>
        </span>
        <ChevronDown size={14} className={`text-muted transition-transform duration-200 ${isOpen ? 'rotate-180 text-accent' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-[calc(100%+0.375rem)] z-50 w-full max-h-60 overflow-y-auto rounded-2xl border border-card-border bg-card-bg/95 backdrop-blur-md p-1.5 shadow-2xl animate-in fade-in-50 zoom-in-95">
          {CURRENCY_OPTIONS.map((opt) => {
            const isSelected = opt.code === value;
            return (
              <button
                key={opt.code}
                type="button"
                onClick={() => {
                  onChange(opt.code);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs font-normal transition-all ${
                  isSelected ? 'bg-accent/10 text-accent font-medium' : 'text-foreground hover:bg-muted-bg/60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-8 text-center px-1 py-0.5 text-[10px] font-normal uppercase tracking-wider bg-muted-bg text-muted border border-card-border/50 rounded">
                    {opt.symbol}
                  </span>
                  <span>{opt.label}</span>
                </div>
                {isSelected && <Check size={14} className="text-accent shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AccountSettings() {
    const { accounts, selectedAccountId, refreshAccounts } = useAccount();
    const activeAccount = accounts.find(a => a.accountId === selectedAccountId);

    const [accountName, setAccountName] = useState<string>('');
    const [initialBalance, setInitialBalance] = useState<string>('');
    const [currency, setCurrency] = useState<string>('USD');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (activeAccount) {
            setAccountName(activeAccount.name);
            setInitialBalance(activeAccount.initialBalance?.toString() || '');
            setCurrency(activeAccount.currency || 'USD');
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
                        <h2 className="text-lg font-normal text-foreground">Account Parameters</h2>
                        <p className="text-xs text-muted font-normal">No account selected</p>
                    </div>
                </div>
                <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/10 text-xs text-orange-500/80 font-normal">
                    Please import your trading data first. Account-specific settings like starting balance will appear here once an account is created.
                </div>
            </div>
        );
    }

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const name = accountName.trim();
            if (!name) {
                toast.error('Please enter an account name');
                return;
            }

            const balance = parseFloat(initialBalance);
            if (isNaN(balance) && initialBalance !== '') {
                toast.error('Please enter a valid number for the initial balance');
                return;
            }

            await updateAccount({
                ...activeAccount,
                name,
                currency,
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
                    <h2 className="text-lg font-normal text-foreground">Account Parameters</h2>
                    <p className="text-xs text-muted font-normal">Configure specific settings for <b>{activeAccount.name}</b></p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                <div>
                    <label htmlFor="account-name" className="block text-[10px] font-normal uppercase tracking-wider text-muted mb-2">
                        Account Name
                    </label>
                    <input
                        id="account-name"
                        type="text"
                        value={accountName}
                        onChange={(e) => setAccountName(e.target.value)}
                        autoComplete="off"
                        className="w-full bg-background/50 border border-card-border rounded-xl py-3 px-4 text-sm font-normal outline-none focus:border-accent transition-all text-foreground"
                    />
                    <p className="mt-2 text-[10px] text-muted font-normal leading-relaxed">
                        Shown in the account switcher and throughout your journal.
                    </p>
                </div>

                <div>
                    <label className="block text-[10px] font-normal uppercase tracking-wider text-muted mb-2">
                        Account Base Currency
                    </label>
                    <CustomCurrencySelect value={currency} onChange={setCurrency} />
                    <p className="mt-2 text-[10px] text-muted font-normal leading-relaxed">
                        Sets the primary currency used for portfolio metrics and account totals.
                    </p>
                </div>

                <div>
                    <label className="block text-[10px] font-normal uppercase tracking-wider text-muted mb-2">
                        Starting Balance ({currency})
                    </label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted font-normal text-sm">{currency === 'HKD' ? 'HK$' : '$'}</span>
                        <input
                            type="number"
                            value={initialBalance}
                            onChange={(e) => setInitialBalance(e.target.value)}
                            placeholder="e.g. 50000"
                            className="w-full bg-background/50 border border-card-border rounded-xl py-3 pl-12 pr-4 text-sm font-normal outline-none focus:border-accent transition-all text-foreground"
                        />
                    </div>
                    <p className="mt-2 text-[10px] text-muted font-normal leading-relaxed">
                        Required to calculate cumulative percentage returns on the dashboard.
                    </p>
                </div>
            </div>

            <div className="mt-6 flex justify-end border-t border-card-border pt-5">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex w-full items-center justify-center gap-2 bg-accent px-6 py-3 text-xs font-normal text-white shadow-lg shadow-accent/20 transition-all hover:bg-accent/90 active:scale-[0.98] disabled:opacity-50 sm:w-auto sm:min-w-56"
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

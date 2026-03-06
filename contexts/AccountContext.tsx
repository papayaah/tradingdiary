'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { AccountRecord } from '@/lib/db/schema';
import { getAccounts } from '@/lib/db/trades';

interface AccountContextType {
    accounts: AccountRecord[];
    selectedAccountId: string | null;
    setSelectedAccountId: (id: string | null) => void;
    refreshAccounts: () => Promise<void>;
    isLoading: boolean;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export function AccountProvider({ children }: { children: React.ReactNode }) {
    const [accounts, setAccounts] = useState<AccountRecord[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const refreshAccounts = async () => {
        setIsLoading(true);
        try {
            const accs = await getAccounts();
            setAccounts(accs);

            // Try to restore from localStorage or pick first
            if (accs.length > 0) {
                const savedId = localStorage.getItem('selected_account_id');
                const exists = accs.some(a => a.accountId === savedId);
                if (savedId && exists) {
                    setSelectedAccountId(savedId);
                } else {
                    setSelectedAccountId(accs[0].accountId);
                }
            } else {
                setSelectedAccountId(null);
            }
        } catch (error) {
            console.error('Failed to load accounts', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        refreshAccounts();
    }, []);

    // Also persist choice
    useEffect(() => {
        if (selectedAccountId) {
            localStorage.setItem('selected_account_id', selectedAccountId);
        }
    }, [selectedAccountId]);

    return (
        <AccountContext.Provider value={{ accounts, selectedAccountId, setSelectedAccountId, refreshAccounts, isLoading }}>
            {children}
        </AccountContext.Provider>
    );
}

export function useAccount() {
    const context = useContext(AccountContext);
    if (context === undefined) {
        throw new Error('useAccount must be used within an AccountProvider');
    }
    return context;
}

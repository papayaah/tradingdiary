'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { ColumnMapping, SideValueMapping, NormalizedTransaction } from '@/lib/import/types';

interface ImportState {
    step: 'upload' | 'mapping' | 'preview';
    headers: string[];
    rows: any[];
    mapping: ColumnMapping;
    sideMap: SideValueMapping;
    previewTransactions: NormalizedTransaction[];
    importFile: File | null;
    isProcessing: boolean;
    error: string | null;
}

interface ImportContextType extends ImportState {
    setStep: (step: 'upload' | 'mapping' | 'preview') => void;
    setMapping: (mapping: ColumnMapping) => void;
    setSideMap: (sideMap: SideValueMapping) => void;
    setPreviewTransactions: (txs: NormalizedTransaction[]) => void;
    setImportFile: (file: File | null) => void;
    updateData: (headers: string[], rows: any[]) => void;
    startProcessing: (task: () => Promise<void>) => Promise<void>;
    clearImportState: () => void;
    setError: (error: string | null) => void;
}

const ImportContext = createContext<ImportContextType | undefined>(undefined);

export function ImportProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<ImportState>({
        step: 'upload',
        headers: [],
        rows: [],
        mapping: {} as any,
        sideMap: {},
        previewTransactions: [],
        importFile: null,
        isProcessing: false,
        error: null,
    });

    // Persist non-file state to localStorage
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const saved = localStorage.getItem('import_flow_state_v2');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setState(prev => ({ ...prev, ...parsed, isProcessing: false }));
            } catch (e) {
                console.error('Failed to restore import state', e);
            }
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const { importFile, isProcessing, error, ...persistable } = state;
        if (persistable.step === 'upload' && persistable.headers.length === 0) {
            localStorage.removeItem('import_flow_state_v2');
        } else {
            localStorage.setItem('import_flow_state_v2', JSON.stringify(persistable));
        }
    }, [state]);

    const setStep = (step: 'upload' | 'mapping' | 'preview') => setState(p => ({ ...p, step }));
    const setMapping = (mapping: ColumnMapping) => setState(p => ({ ...p, mapping }));
    const setSideMap = (sideMap: SideValueMapping) => setState(p => ({ ...p, sideMap }));
    const setPreviewTransactions = (txs: NormalizedTransaction[]) => setState(p => ({ ...p, previewTransactions: txs }));
    const setImportFile = (file: File | null) => setState(p => ({ ...p, importFile: file }));
    const updateData = (headers: string[], rows: any[]) => setState(p => ({ ...p, headers, rows }));
    const setError = (error: string | null) => setState(p => ({ ...p, error }));

    const clearImportState = useCallback(() => {
        setState({
            step: 'upload',
            headers: [],
            rows: [],
            mapping: {} as any,
            sideMap: {},
            previewTransactions: [],
            importFile: null,
            isProcessing: false,
            error: null,
        });
        localStorage.removeItem('import_flow_state_v2');
    }, []);

    const startProcessing = async (task: () => Promise<void>) => {
        setState(p => ({ ...p, isProcessing: true, error: null }));
        try {
            await task();
        } catch (err: any) {
            setState(p => ({ ...p, error: err.message || 'Processing failed' }));
            toast.error(`Import Error: ${err.message}`);
            throw err; // Re-throw to caller for additional handle
        } finally {
            setState(p => ({ ...p, isProcessing: false }));
        }
    };

    const value = {
        ...state,
        setStep,
        setMapping,
        setSideMap,
        setPreviewTransactions,
        setImportFile,
        updateData,
        startProcessing,
        clearImportState,
        setError,
    };

    return <ImportContext.Provider value={value}>{children}</ImportContext.Provider>;
}

export function useImport() {
    const context = useContext(ImportContext);
    if (context === undefined) {
        throw new Error('useImport must be used within an ImportProvider');
    }
    return context;
}

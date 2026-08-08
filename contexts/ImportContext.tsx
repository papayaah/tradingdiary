'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { ColumnMapping, SideValueMapping, NormalizedTransaction } from '@/lib/import/types';

interface ImportState {
    step: 'upload' | 'mapping' | 'preview';
    headers: string[];
    rows: Record<string, string>[];
    mapping: ColumnMapping;
    sideMap: SideValueMapping;
    previewTransactions: NormalizedTransaction[];
    importFile: File | null;
    isProcessing: boolean;
    detectedCurrency: string | null;
    detectedBrokerName: string | null;
    error: string | null;
}

interface ImportContextType extends ImportState {
    setStep: (step: 'upload' | 'mapping' | 'preview') => void;
    setMapping: (mapping: ColumnMapping) => void;
    setSideMap: (sideMap: SideValueMapping) => void;
    setPreviewTransactions: (txs: NormalizedTransaction[]) => void;
    setImportFile: (file: File | null) => void;
    setDetectedCurrency: (currency: string | null) => void;
    setDetectedBrokerName: (brokerName: string | null) => void;
    updateData: (headers: string[], rows: Record<string, string>[]) => void;
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
        mapping: {} as ColumnMapping,
        sideMap: {},
        previewTransactions: [],
        importFile: null,
        isProcessing: false,
        detectedCurrency: null,
        detectedBrokerName: null,
        error: null,
    });

    // Persist non-file state to localStorage
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const saved = localStorage.getItem('import_flow_state_v2');
        if (saved) {
            try {
                const parsed = JSON.parse(saved) as Partial<ImportState>;
                setState(prev => ({ ...prev, ...parsed, isProcessing: false }));
            } catch (e) {
                console.error('Failed to restore import state', e);
            }
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const persistable = {
            step: state.step,
            headers: state.headers,
            rows: state.rows,
            mapping: state.mapping,
            sideMap: state.sideMap,
            previewTransactions: state.previewTransactions,
            detectedCurrency: state.detectedCurrency,
            detectedBrokerName: state.detectedBrokerName,
        };
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
    const setDetectedCurrency = (currency: string | null) => setState(p => ({ ...p, detectedCurrency: currency }));
    const setDetectedBrokerName = (detectedBrokerName: string | null) => setState(p => ({ ...p, detectedBrokerName }));
    const updateData = (headers: string[], rows: Record<string, string>[]) => setState(p => ({ ...p, headers, rows }));
    const setError = (error: string | null) => setState(p => ({ ...p, error }));

    const clearImportState = useCallback(() => {
        setState({
            step: 'upload',
            headers: [],
            rows: [],
            mapping: {} as ColumnMapping,
            sideMap: {},
            previewTransactions: [],
            importFile: null,
            isProcessing: false,
            detectedCurrency: null,
            detectedBrokerName: null,
            error: null,
        });
        localStorage.removeItem('import_flow_state_v2');
    }, []);

    const startProcessing = async (task: () => Promise<void>) => {
        setState(p => ({ ...p, isProcessing: true, error: null }));
        try {
            await task();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Processing failed';
            setState(p => ({ ...p, error: message }));
            toast.error(`Import Error: ${message}`);
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
        setDetectedCurrency,
        setDetectedBrokerName,
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

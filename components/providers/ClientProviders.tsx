'use client';

import { ReactNode } from 'react';
import { IntegrationProvider } from '@/packages/better-auth-connect/src/components';
import { AIManagementProvider } from '@/packages/ai-connect/src/components';
import { authClient } from '@/lib/auth-client';
import { Toaster } from 'sonner';

export function ClientProviders({ children }: { children: ReactNode }) {
    return (
        <IntegrationProvider authClient={authClient}>
            <AIManagementProvider>
                {children}
                <Toaster richColors position="top-right" />
            </AIManagementProvider>
        </IntegrationProvider>
    );
}

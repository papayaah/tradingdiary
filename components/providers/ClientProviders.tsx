'use client';

import { ReactNode } from 'react';
import { IntegrationProvider } from '@/packages/better-auth-connect/src/components';
import { AIManagementProvider } from '@/packages/ai-connect/src/components';
import { authClient } from '@/lib/auth-client';
import { Toaster } from 'sonner';
import { ServiceWorkerRegistrar } from '@/components/providers/ServiceWorkerRegistrar';
import { FeedbackWidget } from '@reactkits.dev/react-feedbox';
import '@reactkits.dev/react-feedbox/styles.css';

export function ClientProviders({ children }: { children: ReactNode }) {
    return (
        <IntegrationProvider authClient={authClient}>
            <AIManagementProvider>
                {children}
                <Toaster richColors position="top-right" />
                <ServiceWorkerRegistrar />
                <FeedbackWidget
                    appId="trading-diary"
                    position="bottom-right"
                    theme="inherit"
                    endpointUrl="/api/feedback"
                />
            </AIManagementProvider>
        </IntegrationProvider>
    );
}


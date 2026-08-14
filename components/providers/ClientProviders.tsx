'use client';

import { ReactNode } from 'react';
import { IntegrationProvider } from '@/packages/better-auth-connect/src/components';
import { AIManagementProvider } from '@/packages/ai-connect/src/components';
import { authClient } from '@/lib/auth-client';
import { Toaster } from 'sonner';
import { ServiceWorkerRegistrar } from '@/components/providers/ServiceWorkerRegistrar';
import { EngageWidget } from '@reactkits.dev/react-engage';
import '@reactkits.dev/react-engage/styles.css';

export function ClientProviders({ children }: { children: ReactNode }) {
    const { data: session } = authClient.useSession();
    const engageUser = session?.user
        ? { id: session.user.id, name: session.user.name, email: session.user.email }
        : undefined;

    return (
        <IntegrationProvider authClient={authClient}>
            <AIManagementProvider
                initialConfig={{ type: 'hosted-api', lastUpdated: new Date().toISOString() }}
            >
                {children}
                <Toaster richColors position="top-right" />
                <ServiceWorkerRegistrar />
                <EngageWidget
                    appId="trading-diary"
                    position="bottom-right"
                    theme="inherit"
                    iconOnly={true}
                    endpointUrl="/api/engage"
                    user={engageUser}
                />
            </AIManagementProvider>
        </IntegrationProvider>
    );
}

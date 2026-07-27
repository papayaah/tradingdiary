'use client';

import { LogIn } from 'lucide-react';
import { UserButton } from '@/packages/better-auth-connect/src/components';
import { tailwindPreset } from '@/packages/better-auth-connect/src/presets/tailwind';
import { defaultIconSet } from '@/packages/better-auth-connect/src/icons';
import { authClient } from '@/lib/auth-client';
import { useAuthOverlay } from './AuthOverlayProvider';

interface LoginButtonProps {
    collapsed?: boolean;
}

export default function LoginButton({ collapsed = false }: LoginButtonProps) {
    const { data: session, isPending } = authClient.useSession();
    const { openSignIn } = useAuthOverlay();

    if (isPending) {
        return <div className="h-9 animate-pulse rounded-lg bg-muted-bg" />;
    }

    if (!session?.user) {
        return (
            <button
                type="button"
                onClick={openSignIn}
                title={collapsed ? 'Sign in' : undefined}
                className={`flex h-9 w-full items-center rounded-lg bg-accent text-sm font-bold text-white transition hover:bg-accent/90 ${
                    collapsed ? 'justify-center px-0' : 'gap-2 px-3'
                }`}
            >
                <LogIn size={16} />
                {!collapsed && <span>Sign in</span>}
            </button>
        );
    }

    return (
        <UserButton
            collapsed={collapsed}
            preset={tailwindPreset}
            icons={defaultIconSet}
            callbackURL={typeof window !== 'undefined' ? window.location.origin : undefined}
        />
    );
}

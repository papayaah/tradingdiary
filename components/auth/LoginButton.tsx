'use client';

import { UserButton } from '@/packages/better-auth-connect/src/components';
import { tailwindPreset } from '@/packages/better-auth-connect/src/presets/tailwind';
import { defaultIconSet } from '@/packages/better-auth-connect/src/icons';
import { useRouter } from 'next/navigation';

interface LoginButtonProps {
    collapsed?: boolean;
}

export default function LoginButton({ collapsed = false }: LoginButtonProps) {
    const router = useRouter();

    return (
        <UserButton
            collapsed={collapsed}
            preset={tailwindPreset}
            icons={defaultIconSet}
            callbackURL={typeof window !== 'undefined' ? window.location.origin : undefined}
            onSignedOut={() => router.push('/login')}
        />
    );
}

'use client';

import { Suspense } from 'react';
import { TrendingUp } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthCard } from '@/packages/better-auth-connect/src/components';
import { tailwindPreset } from '@/packages/better-auth-connect/src/presets/tailwind';
import { defaultIconSet } from '@/packages/better-auth-connect/src/icons';

const DEFAULT_DESTINATION = '/watch';

/**
 * Only allow same-origin relative paths as a post-login destination, to avoid
 * open-redirects. Must start with a single "/" and not "//" (protocol-relative).
 */
function safeReturnTo(raw: string | null): string {
    if (!raw) return DEFAULT_DESTINATION;
    if (!raw.startsWith('/') || raw.startsWith('//')) return DEFAULT_DESTINATION;
    return raw;
}

function LoginContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const returnTo = safeReturnTo(searchParams.get('redirect') ?? searchParams.get('returnTo'));

    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-8 bg-gray-50 dark:bg-gray-900 px-6 py-12">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
                    <TrendingUp size={22} className="text-white" />
                </div>
                <span className="text-xl font-black tracking-tight text-gray-900 dark:text-white">
                    Trading Diary
                </span>
            </div>

            <div className="w-full max-w-sm">
                <AuthCard
                    preset={tailwindPreset}
                    icons={defaultIconSet}
                    title="Welcome back"
                    description="Sign in to sync your trades and watchlist across devices."
                    buttonLabel="Continue with Google"
                    callbackURL={returnTo}
                    continueLabel="Continue to Trading Diary"
                    onContinue={() => router.push(returnTo)}
                    onSignedOut={() => router.refresh()}
                    footer={
                        <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                            Your journal is private and is not posted to Google. By continuing you
                            agree to the Terms and Privacy Policy.
                        </p>
                    }
                />
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-500">
                Secured with Better Auth · PostgreSQL
            </p>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginContent />
        </Suspense>
    );
}

'use client';

import { Suspense } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthCard } from '@/packages/better-auth-connect/src/components';
import { tailwindPreset } from '@/packages/better-auth-connect/src/presets/tailwind';
import { defaultIconSet } from '@/packages/better-auth-connect/src/icons';
import BrandLogo from '@/components/brand/BrandLogo';

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
        <div className="relative min-h-screen flex flex-col items-center justify-center gap-8 bg-gray-50 dark:bg-gray-900 px-6 py-12">
            <button
                type="button"
                onClick={() => {
                    if (window.history.length > 1) {
                        router.back();
                    } else {
                        router.push(returnTo);
                    }
                }}
                className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white/80 px-3 py-2 text-sm font-bold text-gray-700 shadow-sm transition hover:bg-white dark:border-gray-700 dark:bg-gray-800/80 dark:text-gray-200 dark:hover:bg-gray-800 sm:left-6 sm:top-6"
            >
                <ArrowLeft size={16} />
                Back
            </button>
            <div className="flex items-center gap-3">
                <BrandLogo className="h-12 w-12" priority />
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

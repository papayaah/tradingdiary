'use client';

import React, { useEffect } from 'react';
import LoginButton from '@/components/auth/LoginButton';
import { TrendingUp, Shield, Zap, Lock, ArrowRight, LayoutDashboard, Eye, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useIntegrationContext } from '@/packages/better-auth-connect/src/components';

export default function LoginPage() {
    const { authClient } = useIntegrationContext();
    const sessionState = authClient.useSession?.() || { data: null, isPending: true };
    const session = sessionState.data || null;

    return (
        <div className="min-h-screen bg-[#09090b] text-white flex flex-col items-center justify-between p-6 relative overflow-hidden">
            {/* Background Gradients */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent/20 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
            </div>

            {/* Top Navigation Bar */}
            <header className="w-full max-w-5xl flex items-center justify-between z-20 py-4">
                <Link href="/watch" className="flex items-center gap-3 transition-transform hover:scale-105">
                    <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-lg shadow-accent/30">
                        <TrendingUp size={22} className="text-white" />
                    </div>
                    <span className="text-xl font-black tracking-tight text-white">
                        Trading Diary
                    </span>
                </Link>

                <div className="flex items-center gap-2">
                    <Link
                        href="/watch"
                        className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-bold text-white transition-all flex items-center gap-1.5"
                    >
                        <Eye size={14} className="text-accent" /> Watchlist
                    </Link>
                    <Link
                        href="/journal"
                        className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-bold text-white transition-all flex items-center gap-1.5"
                    >
                        <BookOpen size={14} className="text-blue-400" /> Journal
                    </Link>
                    <Link
                        href="/dashboard"
                        className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-bold text-white transition-all flex items-center gap-1.5"
                    >
                        <LayoutDashboard size={14} className="text-emerald-400" /> Dashboard
                    </Link>
                </div>
            </header>

            {/* Main Auth Card */}
            <div className="w-full max-w-md z-10 my-auto">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-extrabold tracking-tight mb-2">
                        {session?.user ? `Welcome, ${session.user.name?.split(' ')[0]}!` : 'Welcome back'}
                    </h1>
                    <p className="text-muted-foreground text-base">
                        {session?.user
                            ? 'You are signed in and synced with PostgreSQL cloud.'
                            : 'Sign in to sync your trades & watchlist across all devices.'}
                    </p>
                </div>

                <div className="bg-card-bg/40 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl relative space-y-6">
                    <div className="space-y-4">
                        <LoginButton />
                    </div>

                    {session?.user && (
                        <div className="pt-2">
                            <Link
                                href="/watch"
                                className="w-full py-3 px-4 bg-accent hover:bg-accent/90 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-accent/30 hover:scale-[1.02] active:scale-95"
                            >
                                Continue to Watchlist <ArrowRight size={18} />
                            </Link>
                        </div>
                    )}

                    <div className="relative flex items-center py-1">
                        <div className="flex-grow border-t border-white/5"></div>
                        <span className="flex-shrink mx-4 text-[10px] font-medium text-white/30 uppercase tracking-widest">
                            Secure Cloud Sync
                        </span>
                        <div className="flex-grow border-t border-white/5"></div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col items-center gap-2 p-3.5 rounded-2xl bg-white/5 border border-white/5 transition-colors hover:bg-white/10">
                            <Shield size={18} className="text-accent" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">Protected</span>
                        </div>
                        <div className="flex flex-col items-center gap-2 p-3.5 rounded-2xl bg-white/5 border border-white/5 transition-colors hover:bg-white/10">
                            <Zap size={18} className="text-blue-400" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">Instant Sync</span>
                        </div>
                    </div>
                </div>

                <div className="mt-8 text-center">
                    <p className="text-muted-foreground text-xs flex items-center justify-center gap-2">
                        <Lock size={13} className="text-white/40" />
                        Your data is encrypted and secure.
                    </p>
                </div>
            </div>

            {/* Footer Badges */}
            <footer className="w-full max-w-5xl py-4 z-20 flex justify-center">
                <div className="grid grid-cols-3 gap-8 opacity-40">
                    <div className="flex flex-col items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Hetzner VPS</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">PostgreSQL</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Better Auth</span>
                    </div>
                </div>
            </footer>

            {/* Aesthetic decorative elements */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-white/5 rounded-full pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-white/5 rounded-full pointer-events-none" />
        </div>
    );
}
